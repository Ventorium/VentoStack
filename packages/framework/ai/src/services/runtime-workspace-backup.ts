import { mkdir, readdir, rm, stat, unlink } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { Database } from '@ventostack/database';
import type { RuntimeSettings } from '../agent-runtime/settings';
import type { AgentRuntimeClient } from '../agent-runtime/types';

export interface WorkspaceBackupInstance {
  id: string;
  tenantId: string;
  userId: string;
  agentId: string;
  sandboxId: string;
}

export interface WorkspaceBackupResult {
  synced: number;
  skipped: number;
  deleted: number;
  totalBytes: number;
}

export interface WorkspaceBackupService {
  backupRoot(instance: Pick<WorkspaceBackupInstance, 'tenantId' | 'userId' | 'agentId'>): string;
  syncInstance(
    instance: WorkspaceBackupInstance,
    client: AgentRuntimeClient,
  ): Promise<WorkspaceBackupResult>;
  restore(instance: WorkspaceBackupInstance, client: AgentRuntimeClient): Promise<number>;
}

const EXCLUDED_DIRS = [
  '.agent-logs/',
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  'target/',
  '.cache/',
  '.npm/',
  '.pnpm-store/',
  '.yarn/',
];

function safeSegment(value: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error('非法的运行时标识');
  return value;
}

function sha256(data: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(data).digest('hex');
}

function normalizeRelative(path: string): string {
  const normalized = normalize(path).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('非法的备份路径');
  }
  return normalized;
}

function isExcluded(relativePath: string, sessionIds: Set<string>): boolean {
  for (const dir of EXCLUDED_DIRS) {
    const bare = dir.replace(/\/$/, '');
    if (relativePath === bare || relativePath.startsWith(dir) || relativePath.includes(`/${dir}`)) {
      return true;
    }
  }
  if (relativePath.endsWith('.tmp')) return true;
  for (const sessionId of sessionIds) {
    // 只排除注入型只读目录；session 下的 outputs 是用户交付文件，必须进入备份。
    if (relativePath === sessionId) return true;
    if (
      relativePath.startsWith(`${sessionId}/knowledges/`) ||
      relativePath.startsWith(`${sessionId}/memories/`)
    ) {
      return true;
    }
  }
  return false;
}

async function localFiles(root: string, prefix = ''): Promise<Array<{ path: string; size: number }>> {
  const result: Array<{ path: string; size: number }> = [];
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      result.push(...(await localFiles(root, relative)));
    } else if (entry.isFile()) {
      const info = await stat(join(root, relative));
      result.push({ path: relative, size: info.size });
    }
  }
  return result;
}

export function createRuntimeWorkspaceBackupService(deps: {
  db: Database;
  settings: RuntimeSettings;
}): WorkspaceBackupService {
  const { db, settings } = deps;
  const root = resolve(settings.storagePath, 'runtime-workspaces');

  function backupRoot(
    instance: Pick<WorkspaceBackupInstance, 'tenantId' | 'userId' | 'agentId'>,
  ): string {
    return join(
      root,
      safeSegment(instance.tenantId),
      safeSegment(instance.userId),
      safeSegment(instance.agentId),
    );
  }

  async function sessionIds(instance: WorkspaceBackupInstance): Promise<Set<string>> {
    const rows = (await db.raw(
      'SELECT session_id FROM ai_session_runtime WHERE instance_id = $1',
      [instance.id],
    )) as Array<{ session_id: string }>;
    return new Set(rows.map((row) => row.session_id));
  }

  async function remoteManifest(
    instance: WorkspaceBackupInstance,
    client: AgentRuntimeClient,
  ): Promise<Array<{ path: string; size: number }>> {
    if (!instance.sandboxId) return [];
    const result = await client.runCommand(
      instance.sandboxId,
      [
        'sh',
        '-lc',
        `cd /workspace && find . -type f -print | while IFS= read -r p; do printf '%s\\t%s\\n' "$p" "$(stat -c %s "$p")"; done | head -n ${Math.min(
          settings.workspaceBackup.maxFiles * 3,
          20_000,
        )}`,
      ],
      { cwd: '/workspace', timeoutMs: 30_000 },
    );
    if (result.exitCode !== 0 && !result.stdout.trim()) {
      throw new Error(`读取工作区文件列表失败：${result.stderr.trim() || 'unknown error'}`);
    }
    const files: Array<{ path: string; size: number }> = [];
    for (const line of result.stdout.split('\n')) {
      if (!line.trim()) continue;
      const [rawPath, rawSize] = line.split('\t');
      if (!rawPath) continue;
      try {
        files.push({ path: normalizeRelative(rawPath), size: Number(rawSize) || 0 });
      } catch {
        // 跳过含非法字符的路径
      }
    }
    return files;
  }

  async function syncInstance(
    instance: WorkspaceBackupInstance,
    client: AgentRuntimeClient,
  ): Promise<WorkspaceBackupResult> {
    if (!settings.workspaceBackup.enabled) {
      return { synced: 0, skipped: 0, deleted: 0, totalBytes: 0 };
    }
    const sessions = await sessionIds(instance);
    const remote = (await remoteManifest(instance, client)).filter(
      (file) => !isExcluded(file.path, sessions),
    );
    const existingRows = (await db.raw(
      'SELECT path, sha256 FROM ai_runtime_workspace_file WHERE tenant_id = $1 AND instance_id = $2',
      [instance.tenantId, instance.id],
    )) as Array<{ path: string; sha256: string }>;
    const existing = new Map(existingRows.map((row) => [row.path, row.sha256]));
    const backupDir = backupRoot(instance);
    const remoteSet = new Set(remote.map((file) => file.path));
    let synced = 0;
    let skipped = 0;
    let totalBytes = 0;
    let count = 0;

    for (const file of remote) {
      if (count >= settings.workspaceBackup.maxFiles) {
        skipped += 1;
        continue;
      }
      if (file.size > settings.workspaceBackup.maxFileBytes) {
        skipped += 1;
        continue;
      }
      if (totalBytes + file.size > settings.workspaceBackup.maxTotalBytes) {
        skipped += 1;
        continue;
      }
      let data: Uint8Array;
      try {
        data = await client.readFile(instance.sandboxId, `/workspace/${file.path}`);
      } catch {
        skipped += 1;
        continue;
      }
      const digest = sha256(data);
      totalBytes += data.byteLength;
      count += 1;
      if (existing.get(file.path) === digest) continue;
      const target = join(backupDir, file.path);
      if (!target.startsWith(`${backupDir}${sep}`)) continue;
      await mkdir(dirname(target), { recursive: true });
      await Bun.write(target, data);
      await db.raw(
        `INSERT INTO ai_runtime_workspace_file
           (tenant_id, instance_id, path, size, sha256, backed_up_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (tenant_id, instance_id, path)
         DO UPDATE SET size = EXCLUDED.size, sha256 = EXCLUDED.sha256, backed_up_at = NOW()`,
        [instance.tenantId, instance.id, file.path, data.byteLength, digest],
      );
      synced += 1;
    }

    let deleted = 0;
    for (const row of existingRows) {
      if (remoteSet.has(row.path)) continue;
      const target = join(backupDir, row.path);
      if (!target.startsWith(`${backupDir}${sep}`)) continue;
      await unlink(target).catch(() => undefined);
      await db.raw(
        'DELETE FROM ai_runtime_workspace_file WHERE tenant_id = $1 AND instance_id = $2 AND path = $3',
        [instance.tenantId, instance.id, row.path],
      );
      deleted += 1;
    }

    await db.raw(
      'UPDATE ai_agent_runtime SET last_workspace_sync_at = NOW(), updated_at = NOW() WHERE id = $1',
      [instance.id],
    );
    return { synced, skipped, deleted, totalBytes };
  }

  async function restore(
    instance: WorkspaceBackupInstance,
    client: AgentRuntimeClient,
  ): Promise<number> {
    if (!settings.workspaceBackup.enabled) return 0;
    const backupDir = backupRoot(instance);
    const files = await localFiles(backupDir);
    let restored = 0;
    for (const file of files) {
      if (file.size > settings.workspaceBackup.maxFileBytes) continue;
      const source = join(backupDir, file.path);
      const data = new Uint8Array(await Bun.file(source).arrayBuffer());
      const target = `/workspace/${file.path}`;
      const parent = target.slice(0, target.lastIndexOf('/'));
      await client.runCommand(instance.sandboxId, ['mkdir', '-p', parent], {
        cwd: '/workspace',
        timeoutMs: 15_000,
      });
      await client.writeFile(instance.sandboxId, target, data);
      restored += 1;
    }
    return restored;
  }

  return { backupRoot, syncInstance, restore };
}
