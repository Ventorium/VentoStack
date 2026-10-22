import type { Database } from '@ventostack/database';
import type { MemoryService } from '../memory/types';
import type { AgentRuntimeClient } from '../agent-runtime/types';

export interface MemorySyncInstance {
  id: string;
  sandboxId: string;
  tenantId: string;
}

export interface RuntimeMemorySyncService {
  syncSessionMemory(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    instance: MemorySyncInstance;
    client: AgentRuntimeClient;
  }): Promise<void>;
  pullGlobal(params: {
    tenantId: string;
    userId: string;
    instance: MemorySyncInstance;
    client: AgentRuntimeClient;
  }): Promise<number>;
  pushGlobal(params: {
    tenantId: string;
    userId: string;
    instance: MemorySyncInstance;
    client: AgentRuntimeClient;
  }): Promise<number>;
}

const GLOBAL_DIR = '/root/.vento-agent/memories';
const MAX_GLOBAL_FILES = 200;
const MAX_GLOBAL_FILE_BYTES = 1024 * 1024;

function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error(`非法的 ${label}`);
  return value;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function encodeTitle(title: string): string {
  return `${encodeURIComponent(title.trim())}.md`;
}

function decodeTitle(fileName: string): string | null {
  if (!fileName.endsWith('.md')) return null;
  const raw = fileName.slice(0, -3);
  try {
    const title = decodeURIComponent(raw).trim();
    return title ? title.slice(0, 128) : null;
  } catch {
    const title = raw.trim();
    return title ? title.slice(0, 128) : null;
  }
}

export function createRuntimeMemorySyncService(deps: {
  db: Database;
  memory: MemoryService;
}): RuntimeMemorySyncService {
  const { db, memory } = deps;

  async function ensureDir(client: AgentRuntimeClient, sandboxId: string, dir: string): Promise<void> {
    await client.runCommand(sandboxId, ['mkdir', '-p', dir], {
      cwd: '/workspace',
      timeoutMs: 15_000,
    });
  }

  async function syncSessionMemory(params: {
    tenantId: string;
    userId: string;
    sessionId: string;
    instance: MemorySyncInstance;
    client: AgentRuntimeClient;
  }): Promise<void> {
    const sessionId = safeSegment(params.sessionId, 'sessionId');
    const dir = `/workspace/${sessionId}/memories`;
    await ensureDir(params.client, params.instance.sandboxId, dir);
    const state = await memory.getSessionMemory(sessionId, {
      tenantId: params.tenantId,
      userId: params.userId,
    });
    const content = state?.content?.trim()
      ? `# 会话记忆\n\n${state.content.trim()}\n`
      : '# 会话记忆\n\n（暂无）\n';
    const target = `${dir}/MEMORY.md`;
    await params.client.writeFile(
      params.instance.sandboxId,
      target,
      new TextEncoder().encode(content),
    );
    await params.client.runCommand(params.instance.sandboxId, ['chmod', '0444', target], {
      cwd: '/workspace',
      timeoutMs: 15_000,
    }).catch(() => undefined);
  }

  async function pullGlobal(params: {
    tenantId: string;
    userId: string;
    instance: MemorySyncInstance;
    client: AgentRuntimeClient;
  }): Promise<number> {
    await ensureDir(params.client, params.instance.sandboxId, GLOBAL_DIR);
    const memories = await memory.listLongTermMemories({
      tenantId: params.tenantId,
      userId: params.userId,
    });
    let written = 0;
    for (const item of memories.slice(0, MAX_GLOBAL_FILES)) {
      const full = await memory.readLongTermMemory(
        { tenantId: params.tenantId, userId: params.userId },
        item.title,
      );
      if (full === null) continue;
      const target = `${GLOBAL_DIR}/${encodeTitle(item.title)}`;
      await params.client.writeFile(
        params.instance.sandboxId,
        target,
        new TextEncoder().encode(stripFrontmatter(full) || `# ${item.title}\n`),
      );
      written += 1;
    }
    await db.raw(
      'UPDATE ai_agent_runtime SET last_global_memory_sync_at = NOW(), updated_at = NOW() WHERE id = $1',
      [params.instance.id],
    );
    return written;
  }

  async function pushGlobal(params: {
    tenantId: string;
    userId: string;
    instance: MemorySyncInstance;
    client: AgentRuntimeClient;
  }): Promise<number> {
    const result = await params.client.runCommand(
      params.instance.sandboxId,
      [
        'sh',
        '-lc',
        `find ${GLOBAL_DIR} -maxdepth 1 -type f -name '*.md' -print 2>/dev/null | head -n ${MAX_GLOBAL_FILES}`,
      ],
      { cwd: '/workspace', timeoutMs: 20_000 },
    );
    if (result.exitCode !== 0 && !result.stdout.trim()) return 0;
    const scope = { tenantId: params.tenantId, userId: params.userId };
    let written = 0;
    for (const line of result.stdout.split('\n')) {
      const rawPath = line.trim();
      if (!rawPath) continue;
      const fileName = rawPath.slice(rawPath.lastIndexOf('/') + 1);
      const title = decodeTitle(fileName);
      if (!title) continue;
      let data: Uint8Array;
      try {
        data = await params.client.readFile(
          params.instance.sandboxId,
          `${GLOBAL_DIR}/${fileName}`,
        );
      } catch {
        continue;
      }
      if (data.byteLength > MAX_GLOBAL_FILE_BYTES) continue;
      const content = stripFrontmatter(new TextDecoder().decode(data));
      if (!content) continue;
      const existing = await memory.readLongTermMemory(scope, title);
      if (existing !== null && stripFrontmatter(existing) === content) continue;
      await memory.createLongTermMemory(scope, title, content);
      written += 1;
    }
    if (written > 0) {
      await db.raw(
        'UPDATE ai_agent_runtime SET last_global_memory_sync_at = NOW(), updated_at = NOW() WHERE id = $1',
        [params.instance.id],
      );
    }
    return written;
  }

  return { syncSessionMemory, pullGlobal, pushGlobal };
}
