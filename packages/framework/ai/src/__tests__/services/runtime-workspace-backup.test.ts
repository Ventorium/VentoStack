import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntimeSettings } from '../../agent-runtime/settings';
import { createRuntimeWorkspaceBackupService } from '../../services/runtime-workspace-backup';
import type { AgentRuntimeClient } from '../../agent-runtime/types';

function fakeDb(files: Map<string, { sha256: string }>) {
  return {
    async raw(sql: string, params: unknown[] = []) {
      if (sql.includes('FROM ai_session_runtime')) return [{ session_id: 'sess-1' }];
      if (sql.includes('FROM ai_runtime_workspace_file')) {
        return [...files.entries()].map(([path, value]) => ({ path, sha256: value.sha256 }));
      }
      if (sql.includes('INSERT INTO ai_runtime_workspace_file')) {
        files.set(String(params[2]), { sha256: String(params[4]) });
        return [];
      }
      if (sql.includes('DELETE FROM ai_runtime_workspace_file')) {
        files.delete(String(params[2]));
        return [];
      }
      return [];
    },
  } as never;
}

describe('workspace backup', () => {
  test('backs up changed files and restores them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vento-ws-'));
    const files = new Map<string, { sha256: string }>();
    const service = createRuntimeWorkspaceBackupService({
      db: fakeDb(files),
      settings: createRuntimeSettings({ storagePath: root }),
    });
    const contents = new Map([
      ['a.txt', new TextEncoder().encode('hello')],
      ['sub/b.md', new TextEncoder().encode('# b')],
      ['sess-1/outputs/deck.pptx', new TextEncoder().encode('pptx')],
      ['sess-1/knowledges/kb/a.md', new TextEncoder().encode('# kb')],
    ]);
    const written = new Map<string, Uint8Array>();
    const client = {
      async runCommand(_id: string, command: string[]) {
        if (command[0] === 'sh') {
          return {
            exitCode: 0,
            stdout: 'a.txt\t5\nsub/b.md\t3\nnode_modules/x.js\t10\nsess-1/outputs/deck.pptx\t4\nsess-1/knowledges/kb/a.md\t4\n',
            stderr: '',
            timedOut: false,
          };
        }
        return { exitCode: 0, stdout: '', stderr: '', timedOut: false };
      },
      async readFile(_id: string, path: string) {
        return contents.get(path.replace('/workspace/', '')) ?? new Uint8Array();
      },
      async writeFile(_id: string, path: string, data: Uint8Array) {
        written.set(path, data);
      },
      async listSandboxes() { return []; },
      async createSandbox() { throw new Error('unused'); },
      async getSandbox() { throw new Error('unused'); },
      async destroySandbox() {},
      async startSandbox() { throw new Error('unused'); },
      async pauseSandbox() { throw new Error('unused'); },
      async resumeSandbox() { throw new Error('unused'); },
      async stopSandbox() { throw new Error('unused'); },
      async killCommand() {},
      async removeFile() {},
      async listDir() { return []; },
      async health() {},
      async info() { return {}; },
    } as AgentRuntimeClient;

    const instance = {
      id: 'instance-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      agentId: 'agent-1',
      sandboxId: 'sbx-1',
    };
    const result = await service.syncInstance(instance, client);
    expect(result.synced).toBe(3);
    expect(await readFile(join(root, 'runtime-workspaces', 'tenant-1', 'user-1', 'agent-1', 'a.txt'), 'utf-8')).toBe('hello');
    expect(await readFile(join(root, 'runtime-workspaces', 'tenant-1', 'user-1', 'agent-1', 'sess-1/outputs/deck.pptx'), 'utf-8')).toBe('pptx');
    await expect(readFile(join(root, 'runtime-workspaces', 'tenant-1', 'user-1', 'agent-1', 'sess-1/knowledges/kb/a.md'))).rejects.toThrow();

    const restored = await service.restore(instance, client);
    expect(restored).toBe(3);
    expect(written.get('/workspace/a.txt')).toEqual(contents.get('a.txt'));
  });
});
