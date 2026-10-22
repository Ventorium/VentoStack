import { describe, expect, test } from 'bun:test';
import { createAgentService } from '../../services/agent';
import { createMockDatabase } from '../helpers';

const baseAgent = {
  name: 'coder',
  model: ['default'],
  systemPrompt: 'help',
  tenantId: 'tenant-1',
  createdBy: 'user-1',
};

describe('Agent virtual environment lifecycle', () => {
  test('creating an enabled agent validates capacity without provisioning a sandbox', async () => {
    const checks: string[] = [];
    const { db, exec } = createMockDatabase();
    const service = createAgentService({
      db,
      async assertCanEnable(tenantId, userId) {
        checks.push(`${tenantId}:${userId}`);
      },
    });

    const result = await service.create({
      ...baseAgent,
      welcomeMessage: '欢迎使用代码助手',
      requiresVirtualEnvironment: true,
    });

    expect(checks).toEqual(['tenant-1:user-1']);
    expect(result.id).toBeString();
    const insert = exec.calls.find((call) => String(call[0]).includes('INSERT INTO ai_agent'));
    expect(insert).toBeDefined();
    expect(insert?.[1]).toContain('欢迎使用代码助手');
    expect(insert?.[1]).toContain(true);
    expect(insert?.[1]).toContain(null);
  });

  test('database failure propagates without creating an orphan sandbox', async () => {
    const service = createAgentService({
      db: { raw: async () => { throw new Error('db down'); } } as never,
      async assertCanEnable() {},
    });

    await expect(service.create({ ...baseAgent, requiresVirtualEnvironment: true })).rejects.toThrow('db down');
  });

  test('delete destroys all user VMs for the agent before deleting the row', async () => {
    const events: string[] = [];
    const db = {
      async raw(sql: string) {
        if (sql.startsWith('SELECT id FROM ai_agent')) return [{ id: 'agent-1' }];
        events.push('db-delete');
        return [];
      },
    } as never;
    const service = createAgentService({
      db,
      async onBeforeDelete(agentId, tenantId) {
        events.push(`vm-destroy:${agentId}:${tenantId}`);
      },
    });

    await service.delete('agent-1', 'tenant-1', { userId: 'user-1' });
    expect(events).toEqual(['vm-destroy:agent-1:tenant-1', 'db-delete']);
  });
});
