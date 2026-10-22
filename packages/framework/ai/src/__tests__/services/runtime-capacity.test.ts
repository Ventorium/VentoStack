import { describe, expect, test } from 'bun:test';
import { createRuntimeSettings } from '../../agent-runtime/settings';
import { createRuntimeCapacityService } from '../../services/runtime-capacity';
import type { RuntimeHostItem } from '../../services/runtime-host';

function host(overrides: Partial<RuntimeHostItem> = {}): RuntimeHostItem {
  return {
    id: 'host-1',
    name: 'host-1',
    note: null,
    listenAddress: '10.0.0.12:8088',
    baseUrl: 'http://10.0.0.12:8088',
    source: 'manual',
    status: 'online',
    enabled: true,
    version: '0.1.0',
    protocolVersion: '1',
    cpuTotal: 8,
    memoryMbTotal: 16384,
    diskMbTotal: 102400,
    maxSandboxes: 10,
    reservedCpu: 0,
    reservedMemoryMb: 0,
    reservedDiskMb: 0,
    usage: {
      sandboxCount: 0,
      runningCount: 0,
      cpu: 0,
      memoryMb: 0,
      diskMb: 0,
      orphans: 0,
      checkedAt: null,
    },
    lastCheckedAt: null,
    lastOnlineAt: null,
    latencyMs: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function capacity(hosts: RuntimeHostItem[], usage = { cpu: 0, memoryMb: 0, diskMb: 0, instances: 0 }) {
  const db = {
    async raw(sql: string) {
      if (sql.includes('FROM ai_agent_runtime')) return [{
        instances: usage.instances,
        cpu: usage.cpu,
        memory_mb: usage.memoryMb,
        disk_mb: usage.diskMb,
      }];
      if (sql.includes('ai_runtime_user_quota')) return [];
      return [];
    },
  } as never;
  return createRuntimeCapacityService({
    db,
    hostService: {
      async list() { return hosts; },
      async getById() { return hosts[0] ?? null; },
      async create() { throw new Error('unused'); },
      async update() { return null; },
      async delete() {},
      async verify() { throw new Error('unused'); },
      async check() { throw new Error('unused'); },
      async rotateToken() { throw new Error('unused'); },
      async resolveConnection() { throw new Error('unused'); },
      async countInstances() { return 0; },
      async ensureEnvHost() {},
      async installCommand() { throw new Error('unused'); },
    },
    settings: createRuntimeSettings({
      storagePath: '/tmp/ai',
      defaultResources: { cpuCount: 2, memoryMb: 2048, diskMb: 4096, maxProcesses: 256 },
      userLimits: { maxInstances: 0, maxCpu: 4, maxMemoryMb: 8192, maxDiskMb: 20480 },
    }),
  });
}

describe('RuntimeCapacityService', () => {
  test('reports availability from online hosts', async () => {
    const service = capacity([host()]);
    const availability = await service.getAvailability('tenant', 'user');
    expect(availability.available).toBe(true);
    expect(availability.capacity.cpu).toBe(8);
    expect(availability.userLimits.maxInstances).toBe(0);
  });

  test('rejects when user CPU cap would be exceeded', async () => {
    const service = capacity([host()], { cpu: 4, memoryMb: 0, diskMb: 0, instances: 2 });
    await expect(service.selectHost('tenant', 'user', {
      cpuCount: 2,
      memoryMb: 2048,
      diskMb: 4096,
      maxProcesses: 256,
    })).rejects.toMatchObject({ errorCode: 'RUNTIME_USER_LIMIT_EXCEEDED', code: 409 });
  });

  test('rejects when no host is online', async () => {
    const service = capacity([host({ status: 'offline' })]);
    await expect(service.selectHost('tenant', 'user', {
      cpuCount: 2,
      memoryMb: 2048,
      diskMb: 4096,
      maxProcesses: 256,
    })).rejects.toMatchObject({ errorCode: 'RUNTIME_CAPACITY_EXHAUSTED', code: 409 });
  });
});
