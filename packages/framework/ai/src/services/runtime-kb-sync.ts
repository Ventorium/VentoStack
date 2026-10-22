import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Database } from '@ventostack/database';
import type { KnowledgeBaseService } from '../knowledge-base/types';
import type { AgentRuntimeClient } from '../agent-runtime/types';

export interface KnowledgeSyncInstance {
  id: string;
  sandboxId: string;
  tenantId: string;
}

export interface KnowledgeSyncParams {
  tenantId: string;
  userId: string;
  agentId: string;
  sessionId: string;
  kbIds: string[];
  instance: KnowledgeSyncInstance;
  client: AgentRuntimeClient;
}

export interface KnowledgeSyncService {
  syncSession(params: KnowledgeSyncParams): Promise<{ synced: number; deleted: number }>;
  listSessionsForKb(
    tenantId: string,
    kbId: string,
  ): Promise<Array<{ sessionId: string; instanceId: string; boundKbIds: string[] }>>;
  markDirty(tenantId: string, sessionId: string): Promise<void>;
  removeSession(tenantId: string, sessionId: string, client?: AgentRuntimeClient): Promise<void>;
  buildPromptBlock(
    params: { tenantId: string; sessionId: string; kbIds: string[] },
  ): Promise<string>;
}

interface KbFile {
  path: string;
  size: number;
  mtimeMs: number;
  data: Uint8Array;
  sha256: string;
}

interface AppliedFile {
  kbId: string;
  path: string;
  size: number;
  mtimeMs: number;
  sha256: string;
}

function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error(`非法的 ${label}`);
  return value;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sha256(data: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(data).digest('hex');
}

async function collectFiles(
  root: string,
  current = '',
): Promise<Array<{ path: string; size: number; mtimeMs: number }>> {
  const result: Array<{ path: string; size: number; mtimeMs: number }> = [];
  let entries: Array<{
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }>;
  try {
    entries = await readdir(join(root, current), { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const relativePath = current ? `${current}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      result.push(...(await collectFiles(root, relativePath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(md|txt)$/i.test(entry.name)) continue;
    const info = await stat(join(root, relativePath));
    result.push({ path: relativePath, size: info.size, mtimeMs: info.mtimeMs });
  }
  return result;
}

export function createRuntimeKnowledgeSyncService(deps: {
  db: Database;
  kbService: KnowledgeBaseService;
  storagePath: string;
}): KnowledgeSyncService {
  const { db, kbService, storagePath } = deps;
  const contentRoot = resolve(storagePath, 'knowledge-bases');
  const locks = new Map<string, Promise<{ synced: number; deleted: number }>>();

  function kbContentPath(kbId: string): string {
    return join(contentRoot, safeSegment(kbId, 'kbId'), 'content');
  }

  function targetBase(sessionId: string): string {
    return `/workspace/${safeSegment(sessionId, 'sessionId')}/knowledges`;
  }

  async function loadApplied(
    tenantId: string,
    sessionId: string,
    kbIds: string[],
  ): Promise<Map<string, AppliedFile>> {
    if (kbIds.length === 0) return new Map();
    const placeholders = kbIds.map((_, index) => `$${index + 3}`).join(', ');
    const rows = (await db.raw(
      `SELECT kb_id, path, size, mtime_ms, sha256
       FROM ai_runtime_session_kb_file
       WHERE tenant_id = $1 AND session_id = $2 AND kb_id IN (${placeholders})`,
      [tenantId, sessionId, ...kbIds],
    )) as Array<{
      kb_id: string;
      path: string;
      size: number;
      mtime_ms: number;
      sha256: string;
    }>;
    return new Map(
      rows.map((row) => [
        `${row.kb_id}:${row.path}`,
        {
          kbId: row.kb_id,
          path: row.path,
          size: asNumber(row.size),
          mtimeMs: asNumber(row.mtime_ms),
          sha256: row.sha256,
        },
      ]),
    );
  }

  async function removeRemote(
    client: AgentRuntimeClient,
    sandboxId: string,
    target: string,
  ): Promise<void> {
    await client.removeFile(sandboxId, target, false).catch(async () => {
      await client
        .runCommand(sandboxId, ['rm', '-f', '--', target], {
          cwd: '/workspace',
          timeoutMs: 15_000,
        })
        .catch(() => undefined);
    });
  }

  async function upsertBinding(params: KnowledgeSyncParams): Promise<void> {
    await db.raw(
      `INSERT INTO ai_session_runtime
         (session_id, tenant_id, instance_id, bound_kb_ids, kb_dirty, last_synced_at)
       VALUES ($1,$2,$3,$4::text::jsonb,FALSE,NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         instance_id = EXCLUDED.instance_id,
         bound_kb_ids = EXCLUDED.bound_kb_ids,
         kb_dirty = FALSE,
         last_synced_at = NOW(),
         updated_at = NOW()`,
      [params.sessionId, params.tenantId, params.instance.id, JSON.stringify(params.kbIds)],
    );
  }

  async function doSyncSession(
    params: KnowledgeSyncParams,
  ): Promise<{ synced: number; deleted: number }> {
    const sessionId = safeSegment(params.sessionId, 'sessionId');
    const base = targetBase(sessionId);
    const previous = (await db.raw(
      'SELECT bound_kb_ids FROM ai_session_runtime WHERE session_id = $1',
      [sessionId],
    )) as Array<{ bound_kb_ids: unknown }>;
    let previousKbIds: string[] = [];
    if (Array.isArray(previous[0]?.bound_kb_ids)) {
      previousKbIds = previous[0].bound_kb_ids as string[];
    } else if (typeof previous[0]?.bound_kb_ids === 'string') {
      try {
        const parsed = JSON.parse(previous[0].bound_kb_ids) as unknown;
        if (Array.isArray(parsed)) previousKbIds = parsed as string[];
      } catch {
        previousKbIds = [];
      }
    }
    await upsertBinding(params);
    const removedKbs = previousKbIds.filter((id) => !params.kbIds.includes(id));
    for (const kbId of removedKbs) {
      const dir = `${base}/${safeSegment(kbId, 'kbId')}`;
      await clientRemoveDir(params.client, params.instance.sandboxId, dir);
      await db.raw(
        'DELETE FROM ai_runtime_session_kb_file WHERE tenant_id = $1 AND session_id = $2 AND kb_id = $3',
        [params.tenantId, sessionId, kbId],
      );
    }

    const applied = await loadApplied(params.tenantId, sessionId, params.kbIds);
    let synced = 0;
    let deleted = 0;
    const indexLines: string[] = ['# 知识库索引', ''];

    for (const kbId of params.kbIds) {
      const kb = await kbService.getById(kbId, params.tenantId);
      if (!kb) continue;
      const source = kbContentPath(kbId);
      const files = await collectFiles(source);
      const desired = new Map<string, { size: number; mtimeMs: number }>();

      for (const file of files) {
        const disabled = await kbService.isFileDisabled(kbId, file.path, params.tenantId);
        if (disabled) continue;
        desired.set(file.path, { size: file.size, mtimeMs: file.mtimeMs });
        const key = `${kbId}:${file.path}`;
        const current = applied.get(key);
        if (current && current.size === file.size && current.mtimeMs === file.mtimeMs) {
          continue;
        }
        const data = new Uint8Array(await Bun.file(join(source, file.path)).arrayBuffer());
        const digest = sha256(data);
        if (current?.sha256 === digest && current.size === file.size) {
          await db.raw(
            `UPDATE ai_runtime_session_kb_file
             SET mtime_ms = $5, synced_at = NOW()
             WHERE tenant_id = $1 AND session_id = $2 AND kb_id = $3 AND path = $4`,
            [params.tenantId, sessionId, kbId, file.path, file.mtimeMs],
          );
          continue;
        }
        const target = `${base}/${safeSegment(kbId, 'kbId')}/${file.path}`;
        const parent = target.slice(0, target.lastIndexOf('/'));
        await params.client.runCommand(params.instance.sandboxId, ['mkdir', '-p', parent], {
          cwd: '/workspace',
          timeoutMs: 15_000,
        });
        const temp = `${target}.tmp-${crypto.randomUUID()}`;
        await params.client.writeFile(params.instance.sandboxId, temp, data);
        await params.client.runCommand(params.instance.sandboxId, ['mv', '--', temp, target], {
          cwd: '/workspace',
          timeoutMs: 15_000,
        });
        await params.client.runCommand(params.instance.sandboxId, ['chmod', '0444', target], {
          cwd: '/workspace',
          timeoutMs: 15_000,
        });
        await db.raw(
          `INSERT INTO ai_runtime_session_kb_file
             (tenant_id, session_id, kb_id, path, size, mtime_ms, sha256, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT (tenant_id, session_id, kb_id, path)
           DO UPDATE SET size = EXCLUDED.size, mtime_ms = EXCLUDED.mtime_ms,
                         sha256 = EXCLUDED.sha256, synced_at = NOW()`,
          [
            params.tenantId,
            sessionId,
            kbId,
            file.path,
            data.byteLength,
            file.mtimeMs,
            digest,
          ],
        );
        synced += 1;
      }

      for (const [key, current] of applied) {
        if (current.kbId !== kbId) continue;
        if (desired.has(current.path)) continue;
        const target = `${base}/${safeSegment(kbId, 'kbId')}/${current.path}`;
        await removeRemote(params.client, params.instance.sandboxId, target);
        await db.raw(
          'DELETE FROM ai_runtime_session_kb_file WHERE tenant_id = $1 AND session_id = $2 AND kb_id = $3 AND path = $4',
          [params.tenantId, sessionId, kbId, current.path],
        );
        deleted += 1;
      }

      indexLines.push(`- ${kb.name}（${kb.id}）→ ${base}/${kbId}/（${files.length} 个文件）`);
    }

    const kbDir = `${base}`;
    await params.client.runCommand(params.instance.sandboxId, ['mkdir', '-p', kbDir], {
      cwd: '/workspace',
      timeoutMs: 15_000,
    });
    const index = `${indexLines.join('\n')}\n`;
    const indexTarget = `${base}/INDEX.md`;
    await params.client.writeFile(
      params.instance.sandboxId,
      indexTarget,
      new TextEncoder().encode(index),
    );
    await params.client.runCommand(
      params.instance.sandboxId,
      ['chmod', '-R', 'a-w', base],
      { cwd: '/workspace', timeoutMs: 30_000 },
    ).catch(() => undefined);
    await params.client.runCommand(
      params.instance.sandboxId,
      ['chmod', '-R', 'a+rX', base],
      { cwd: '/workspace', timeoutMs: 30_000 },
    ).catch(() => undefined);
    await db.raw(
      `UPDATE ai_session_runtime SET kb_dirty = FALSE, last_synced_at = NOW(), updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId],
    );
    return { synced, deleted };
  }

  async function clientRemoveDir(
    client: AgentRuntimeClient,
    sandboxId: string,
    dir: string,
  ): Promise<void> {
    await client
      .runCommand(sandboxId, ['rm', '-rf', '--', dir], {
        cwd: '/workspace',
        timeoutMs: 30_000,
      })
      .catch(() => undefined);
  }

  async function listSessionsForKb(
    tenantId: string,
    kbId: string,
  ): Promise<Array<{ sessionId: string; instanceId: string; boundKbIds: string[] }>> {
    const rows = (await db.raw(
      `SELECT session_id, instance_id, bound_kb_ids FROM ai_session_runtime
       WHERE tenant_id = $1 AND bound_kb_ids @> $2::text::jsonb`,
      [tenantId, JSON.stringify([kbId])],
    )) as Array<{ session_id: string; instance_id: string; bound_kb_ids: unknown }>;
    return rows.map((row) => ({
      sessionId: row.session_id,
      instanceId: row.instance_id,
      boundKbIds: Array.isArray(row.bound_kb_ids)
        ? (row.bound_kb_ids as string[])
        : typeof row.bound_kb_ids === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(row.bound_kb_ids) as unknown;
                return Array.isArray(parsed) ? (parsed as string[]) : [];
              } catch {
                return [];
              }
            })()
          : [],
    }));
  }

  async function markDirty(tenantId: string, sessionId: string): Promise<void> {
    await db.raw(
      'UPDATE ai_session_runtime SET kb_dirty = TRUE, updated_at = NOW() WHERE tenant_id = $1 AND session_id = $2',
      [tenantId, sessionId],
    );
  }

  async function removeSession(
    tenantId: string,
    sessionId: string,
    client?: AgentRuntimeClient,
  ): Promise<void> {
    if (client) {
      const rows = (await db.raw(
        'SELECT instance_id FROM ai_session_runtime WHERE tenant_id = $1 AND session_id = $2',
        [tenantId, sessionId],
      )) as Array<{ instance_id: string }>;
      if (rows[0]) {
        const inst = (await db.raw('SELECT sandbox_id FROM ai_agent_runtime WHERE id = $1', [
          rows[0].instance_id,
        ])) as Array<{ sandbox_id: string | null }>;
        if (inst[0]?.sandbox_id) {
          await clientRemoveDir(client, inst[0].sandbox_id, targetBase(sessionId));
        }
      }
    }
    await db.raw('DELETE FROM ai_runtime_session_kb_file WHERE tenant_id = $1 AND session_id = $2', [
      tenantId,
      sessionId,
    ]);
    await db.raw('DELETE FROM ai_session_runtime WHERE tenant_id = $1 AND session_id = $2', [
      tenantId,
      sessionId,
    ]);
  }

  async function buildPromptBlock(params: {
    tenantId: string;
    sessionId: string;
    kbIds: string[];
  }): Promise<string> {
    const base = targetBase(params.sessionId);
    const sessionRoot = `/workspace/${params.sessionId}`;
    const lines = [
      '## 本次会话的文件位置',
      `- 知识库（只读）：${base}`,
      `  - 会话记忆（只读）：${sessionRoot}/memories`,
      `  - 生成文件目录（可读写）：${sessionRoot}/outputs`,
      '- 全局记忆（可读写）：/root/.vento-agent/memories',
      '',
      '## 文件访问边界（必须遵守）',
      `- 只能读取当前会话目录 ${sessionRoot} 下的知识库和会话记忆。`,
      '- 禁止读取、遍历或引用 /workspace 下其他会话目录、其他用户/Agent 的知识库、记忆和生成文件。',
      '- 只有用户在当前对话中明确要求跨会话/跨目录查找时，才允许读取其他目录；否则必须先向用户确认。',
      `- 需要生成 PPT、Excel、Word、PDF、图片、代码等交付文件时，统一写入 ${sessionRoot}/outputs，不要写到 /workspace 根目录或其他会话目录。`,
    ];
    if (params.kbIds.length > 0) {
      for (const kbId of params.kbIds) {
        const kb = await kbService.getById(kbId, params.tenantId);
        if (!kb) continue;
        lines.push(`  - ${kb.name}（${kb.id}）→ ${base}/${kb.id}`);
      }
    } else {
      lines.push('  - 本次会话未绑定知识库');
    }
    return lines.join('\n');
  }

  function syncSession(
    params: KnowledgeSyncParams,
  ): Promise<{ synced: number; deleted: number }> {
    const key = `${params.tenantId}:${params.sessionId}`;
    const existing = locks.get(key);
    if (existing) return existing;
    const task = doSyncSession(params).finally(() => {
      locks.delete(key);
    });
    locks.set(key, task);
    return task;
  }

  return {
    syncSession,
    listSessionsForKb,
    markDirty,
    removeSession,
    buildPromptBlock,
  };
}
