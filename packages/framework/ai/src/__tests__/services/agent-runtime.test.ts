import { describe, expect, test } from 'bun:test';
import { createAgentService } from '../../services/agent';
import { createMockDatabase } from '../helpers';

const baseAgent = {
  name: 'coder',
  model: 'default',
  systemPrompt: 'help',
  tenantId: 'tenant-1',
  createdBy: 'user-1',
};

describe('Agent virtual environment lifecycle', () => {
  test('creating an enabled agent provisions its sandbox before persisting the binding', async () => {
    const events: string[] = [];
    const { db, exec } = createMockDatabase();
    const service = createAgentService({
      db,
      runtime: {
        async createSandbox(request) {
          events.push(`sandbox:${request.sessionId}`);
          return { sandboxId: 'sbx-1', state: 'RUNNING' };
        },
        async getSandbox() { return { sandboxId: 'sbx-1', state: 'RUNNING' }; },
        async destroySandbox() {},
        async runCommand() { throw new Error('unused'); },
        async readFile() { throw new Error('unused'); },
        async writeFile() { throw new Error('unused'); },
      },
    });

    const result = await service.create({ ...baseAgent, requiresVirtualEnvironment: true });

    expect(events).toHaveLength(1);
    expect(result.id).toBeString();
    const insert = exec.calls.find((call) => String(call[0]).includes('INSERT INTO ai_agent'));
    expect(insert).toBeDefined();
    expect(insert?.[1]).toContain('sbx-1');
  });

  test('database failure compensates by destroying the newly-created sandbox', async () => {
    const destroyed: string[] = [];
    const service = createAgentService({
      db: { raw: async () => { throw new Error('db down'); } } as never,
      runtime: {
        async createSandbox() { return { sandboxId: 'sbx-orphan', state: 'RUNNING' }; },
        async getSandbox() { return { sandboxId: 'sbx-orphan', state: 'RUNNING' }; },
        async destroySandbox(id) { destroyed.push(id); },
        async runCommand() { throw new Error('unused'); },
        async readFile() { throw new Error('unused'); },
        async writeFile() { throw new Error('unused'); },
      },
    });

    await expect(service.create({ ...baseAgent, requiresVirtualEnvironment: true })).rejects.toThrow('db down');
    expect(destroyed).toEqual(['sbx-orphan']);
  });

  test('delete destroys the bound sandbox before deleting the agent row', async () => {
    const events: string[] = [];
    const db = {
      async raw(sql: string) {
        if (sql.startsWith('SELECT sandbox_id')) return [{ sandboxId: 'sbx-1' }];
        events.push('db-delete');
        return [];
      },
    } as never;
    const service = createAgentService({
      db,
      runtime: {
        async createSandbox() { throw new Error('unused'); },
        async getSandbox() { return { sandboxId: 'sbx-1', state: 'RUNNING' }; },
        async destroySandbox() { events.push('sandbox-destroy'); },
        async runCommand() { throw new Error('unused'); },
        async readFile() { throw new Error('unused'); },
        async writeFile() { throw new Error('unused'); },
      },
    });

    await service.delete('agent-1', 'tenant-1', { userId: 'user-1' });
    expect(events).toEqual(['sandbox-destroy', 'db-delete']);
  });
});
