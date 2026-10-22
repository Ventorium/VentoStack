import { describe, expect, test } from 'bun:test';
import { createRuntimeSettings } from '../../agent-runtime/settings';
import { createRuntimeInstanceService } from '../../services/runtime-instance';
import type { RuntimeHostItem } from '../../services/runtime-host';
import type { RuntimeSandbox } from '../../agent-runtime/types';

function host(): RuntimeHostItem {
  return {
    id: 'host-1', name: 'host-1', note: null, listenAddress: '10.0.0.12:8088',
    baseUrl: 'http://10.0.0.12:8088', source: 'manual', status: 'online', enabled: true,
    version: '0.1.0', protocolVersion: '1', cpuTotal: 8, memoryMbTotal: 16384,
    diskMbTotal: 102400, maxSandboxes: 10, reservedCpu: 0, reservedMemoryMb: 0,
    reservedDiskMb: 0,
    usage: { sandboxCount: 0, runningCount: 0, cpu: 0, memoryMb: 0, diskMb: 0, orphans: 0, checkedAt: null },
    lastCheckedAt: null, lastOnlineAt: null, latencyMs: null, lastError: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function fakeDb() {
  const rows: Array<Record<string, unknown>> = [];
  const db = {
    async raw(sql: string, params: unknown[] = []) {
      if (sql.includes('INSERT INTO ai_agent_runtime')) {
        const existing = rows.find(
          (row) => row.tenant_id === params[1] && row.user_id === params[3] && row.agent_id === params[2],
        );
        if (existing) return [];
        const row = {
          id: params[0], tenant_id: params[1], agent_id: params[2], user_id: params[3],
          host_id: params[4], sandbox_id: null, state: 'provisioning',
          cpu_count: params[5], memory_mb: params[6], disk_mb: params[7], max_processes: params[8],
          last_active_at: null, last_checked_at: null, expires_at: null,
          last_global_memory_sync_at: null, last_workspace_sync_at: null,
          idle_notified_at: null, stale_notified_at: null, error: null,
          created_at: new Date(), updated_at: new Date(),
        };
        rows.push(row);
        return [row];
      }
      if (sql.includes('FROM ai_agent_runtime') && sql.includes('WHERE id = $1')) {
        return rows.filter((row) => row.id === params[0]);
      }
      if (sql.includes('FROM ai_agent_runtime') && sql.includes('agent_id = $3')) {
        return rows.filter(
          (row) => row.tenant_id === params[0] && row.user_id === params[1] && row.agent_id === params[2],
        );
      }
      if (sql.includes('FROM ai_agent_runtime')) return rows;
      if (sql.includes('UPDATE ai_agent_runtime')) {
        const row = rows.find((item) => item.id === params[0]);
        if (!row) return [];
        const setSql = sql.slice(sql.indexOf('SET'), sql.indexOf('WHERE'));
        const sets = setSql.slice(3).split(',').map((part) => part.trim());
        sets.forEach((set, index) => {
          const match = set.match(/^(\w+) = \$(\d+)/);
          if (!match) return;
          row[match[1]!] = params[Number(match[2]) - 1];
        });
        row.updated_at = new Date();
        return [];
      }
      return [];
    },
  };
  return { db: db as never, rows };
}

describe('RuntimeInstanceService', () => {
  test('provisions one sandbox per (user, agent) and reuses it', async () => {
    const { db, rows } = fakeDb();
    const sandbox: RuntimeSandbox = {
      sandboxId: 'sbx-1', state: 'RUNNING', sessionId: 'instance',
      resources: { cpuCount: 2, memoryMb: 4096, diskMb: 8192, maxProcesses: 512 },
    };
    let created = 0;
    const client = {
      async createSandbox() { created += 1; return sandbox; },
      async getSandbox() { return sandbox; },
      async listSandboxes() { return [sandbox]; },
      async destroySandbox() {},
      async startSandbox() { return sandbox; },
      async pauseSandbox() { return sandbox; },
      async resumeSandbox() { return sandbox; },
      async stopSandbox() { return sandbox; },
      async runCommand() { return { exitCode: 0, stdout: '', stderr: '', timedOut: false }; },
      async killCommand() {},
      async readFile() { return new Uint8Array(); },
      async writeFile() {},
      async removeFile() {},
      async listDir() { return []; },
      async health() {},
      async info() { return {}; },
    };
    const service = createRuntimeInstanceService({
      db,
      settings: createRuntimeSettings({ storagePath: '/tmp/ai' }),
      hostService: {
        async list() { return [host()]; },
        async getById() { return host(); },
        async create() { throw new Error('unused'); },
        async update() { return null; },
        async delete() {},
        async verify() { throw new Error('unused'); },
        async check() { throw new Error('unused'); },
        async rotateToken() { throw new Error('unused'); },
        async resolveConnection() { throw new Error('unused'); },
        async countInstances() { return rows.length; },
        async ensureEnvHost() {},
        async installCommand() { throw new Error('unused'); },
      },
      capacity: {
        async selectHost() { return host(); },
        async getAvailability() { throw new Error('unused'); },
        async getUserUsage() { throw new Error('unused'); },
        async getUserLimits() { throw new Error('unused'); },
        async assertCanEnable() { throw new Error('unused'); },
      },
      clients: { async get() { return client; }, invalidate() {}, clear() {} },
      workspaceBackup: {
        backupRoot() { return '/tmp'; },
        async syncInstance() { return { synced: 0, skipped: 0, deleted: 0, totalBytes: 0 }; },
        async restore() { return 0; },
      },
    });

    const first = await service.ensure({ tenantId: 'tenant', userId: 'user', agentId: 'agent' });
    const second = await service.ensure({ tenantId: 'tenant', userId: 'user', agentId: 'agent' });
    expect(first.instance.id).toBe(second.instance.id);
    expect(first.instance.sandboxId).toBe('sbx-1');
    expect(created).toBe(1);
    expect(rows).toHaveLength(1);
  });
});
