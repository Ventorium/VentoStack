import { describe, expect, test } from 'bun:test';
import { createRuntimeSettings } from '../../agent-runtime/settings';
import { createRuntimeHostService } from '../../services/runtime-host';

function fakeDb() {
  const hosts: Array<Record<string, unknown>> = [];
  const db = {
    async raw(sql: string, params: unknown[] = []) {
      if (sql.includes('INSERT INTO ai_runtime_host')) {
        const [
          id,
          name,
          note,
          listenAddress,
          tokenCipher,
          cpuTotal,
          memoryMbTotal,
          diskMbTotal,
          maxSandboxes,
          reservedCpu,
          reservedMemoryMb,
          reservedDiskMb,
          createdBy,
        ] = params;
        hosts.push({
          id,
          name,
          note,
          listen_address: listenAddress,
          base_url: null,
          token_cipher: tokenCipher,
          source: 'manual',
          source_key: null,
          status: 'pending',
          enabled: true,
          version: null,
          protocol_version: null,
          cpu_total: cpuTotal,
          memory_mb_total: memoryMbTotal,
          disk_mb_total: diskMbTotal,
          max_sandboxes: maxSandboxes,
          reserved_cpu: reservedCpu,
          reserved_memory_mb: reservedMemoryMb,
          reserved_disk_mb: reservedDiskMb,
          usage_json: {},
          last_checked_at: null,
          last_online_at: null,
          latency_ms: null,
          last_error: null,
          created_by: createdBy,
          created_at: new Date(),
          updated_at: new Date(),
        });
        return [];
      }
      if (sql.includes('FROM ai_runtime_host WHERE id = $1')) {
        return hosts.filter((row) => row.id === params[0]);
      }
      if (sql.includes('FROM ai_runtime_host ORDER BY')) return [...hosts];
      if (sql.includes('DELETE FROM ai_runtime_host')) {
        for (let index = hosts.length - 1; index >= 0; index -= 1) {
          if (hosts[index]!.id === params[0]) hosts.splice(index, 1);
        }
        return [];
      }
      if (sql.includes('UPDATE ai_runtime_host')) return [];
      if (sql.includes('FROM ai_agent_runtime')) return [{ count: 0 }];
      return [];
    },
  };
  return { db: db as never, hosts };
}

const encryptor = {
  async encrypt(value: string) {
    return `ENC:${value}`;
  },
  async decrypt(value: string) {
    return value.replace(/^ENC:/, '');
  },
  isEncrypted(value: string) {
    return value.startsWith('ENC:');
  },
};

describe('RuntimeHostService', () => {
  test('create returns an install command once and never exposes the token in the item', async () => {
    const { db } = fakeDb();
    const service = createRuntimeHostService({
      db,
      encryptor,
      settings: createRuntimeSettings({ storagePath: '/tmp/ai' }),
    });
    const result = await service.create({
      name: 'host-1',
      listenAddress: '10.0.0.12:8088',
      createdBy: 'admin-1',
    });
    expect(result.item.name).toBe('host-1');
    expect(result.item).not.toHaveProperty('token');
    expect(result.installCommand).toContain('--listen');
    expect(result.installCommand).toContain('10.0.0.12:8088');
    expect(result.installCommand).toContain('--token');
  });

  test('list returns hosts without token cipher', async () => {
    const { db } = fakeDb();
    const service = createRuntimeHostService({
      db,
      encryptor,
      settings: createRuntimeSettings({ storagePath: '/tmp/ai' }),
    });
    await service.create({ name: 'host-1', listenAddress: '10.0.0.12:8088' });
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('host-1');
    expect(list[0]).not.toHaveProperty('token_cipher');
  });
});
