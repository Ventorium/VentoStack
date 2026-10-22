import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntimeKnowledgeSyncService } from '../../services/runtime-kb-sync';
import type { AgentRuntimeClient } from '../../agent-runtime/types';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vento-kb-'));
  const content = join(root, 'knowledge-bases', 'kb-1', 'content');
  await mkdir(content, { recursive: true });
  await writeFile(join(content, 'a.md'), '# A\n');
  await writeFile(join(content, 'b.txt'), 'B\n');
  const manifests = new Map<string, Record<string, unknown>>();
  const disabled = new Set<string>();
  const db = {
    async raw(sql: string, params: unknown[] = []) {
      if (sql.includes('SELECT bound_kb_ids')) return [];
      if (sql.includes('INSERT INTO ai_session_runtime')) return [];
      if (sql.includes('SELECT kb_id, path, size, mtime_ms, sha256')) {
        return [...manifests.values()];
      }
      if (sql.includes('INSERT INTO ai_runtime_session_kb_file')) {
        const key = `${params[2]}:${params[3]}`;
        manifests.set(key, {
          kb_id: params[2], path: params[3], size: params[4], mtime_ms: params[5], sha256: params[6],
        });
        return [];
      }
      if (sql.includes('UPDATE ai_runtime_session_kb_file')) return [];
      if (sql.includes('DELETE FROM ai_runtime_session_kb_file')) {
        manifests.delete(`${params[2]}:${params[3]}`);
        return [];
      }
      return [];
    },
  } as never;
  const kbService = {
    async getById() { return { id: 'kb-1', name: 'KB One' }; },
    async isFileDisabled(_kbId: string, path: string) { return disabled.has(path); },
  } as never;
  const writes = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const client = {
    async runCommand(_id: string, command: string[]) {
      if (command[0] === 'mv' && command.length >= 4) {
        const from = command[2]!;
        const to = command[3]!;
        const data = writes.get(from);
        if (data) {
          writes.delete(from);
          writes.set(to, data);
        }
      }
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false };
    },
    async writeFile(_id: string, path: string, data: Uint8Array) { writes.set(path, data); },
    async removeFile(_id: string, path: string) { removed.push(path); },
    async readFile() { return new Uint8Array(); },
    async listSandboxes() { return []; },
    async createSandbox() { throw new Error('unused'); },
    async getSandbox() { throw new Error('unused'); },
    async destroySandbox() {},
    async startSandbox() { throw new Error('unused'); },
    async pauseSandbox() { throw new Error('unused'); },
    async resumeSandbox() { throw new Error('unused'); },
    async stopSandbox() { throw new Error('unused'); },
    async killCommand() {},
    async listDir() { return []; },
    async health() {},
    async info() { return {}; },
  } as AgentRuntimeClient;
  const service = createRuntimeKnowledgeSyncService({ db, kbService, storagePath: root });
  const params = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    agentId: 'agent-1',
    sessionId: 'session-1',
    kbIds: ['kb-1'],
    instance: { id: 'instance-1', sandboxId: 'sbx-1', tenantId: 'tenant-1' },
    client,
  };
  return { service, params, writes, removed, disabled, content };
}

describe('knowledge sync', () => {
  test('uploads enabled files, skips unchanged, removes disabled files', async () => {
    const f = await fixture();
    const first = await f.service.syncSession(f.params);
    expect(first.synced).toBe(2);
    expect(f.writes.has('/workspace/session-1/knowledges/kb-1/a.md')).toBe(true);
    expect(f.writes.has('/workspace/session-1/knowledges/kb-1/b.txt')).toBe(true);

    const second = await f.service.syncSession(f.params);
    expect(second.synced).toBe(0);

    f.disabled.add('b.txt');
    const third = await f.service.syncSession(f.params);
    expect(third.deleted).toBe(1);
    expect(f.removed).toContain('/workspace/session-1/knowledges/kb-1/b.txt');
  });

  test('prompt constrains knowledge access to the current session and names outputs', async () => {
    const f = await fixture();
    const text = await f.service.buildPromptBlock({
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      kbIds: ['kb-1'],
    });
    expect(text).toContain('/workspace/session-1/outputs');
    expect(text).toContain('只能读取当前会话目录 /workspace/session-1 下');
    expect(text).toContain('禁止读取、遍历或引用 /workspace 下其他会话目录');
  });
});
