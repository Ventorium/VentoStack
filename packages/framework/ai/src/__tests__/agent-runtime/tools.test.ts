import { describe, expect, test } from 'bun:test';
import { createAgentRuntimeTools } from '../../agent-runtime/tools';
import type { AgentRuntimeClient } from '../../agent-runtime/types';

function runtime(overrides: Partial<AgentRuntimeClient> = {}): AgentRuntimeClient {
  return {
    async createSandbox() { throw new Error('unused'); },
    async getSandbox() { throw new Error('unused'); },
    async destroySandbox() {},
    async runCommand(_id, command, cwd) { return { exitCode: 0, stdout: `${cwd}:${command.join(' ')}`, stderr: '', timedOut: false }; },
    async readFile() { return new TextEncoder().encode('hello'); },
    async writeFile() {},
    ...overrides,
  };
}

describe('sandbox-bound Agent tools', () => {
  test('terminal executes in the bound sandbox workspace', async () => {
    const tool = createAgentRuntimeTools(runtime(), 'sbx-1').find((item) => item.name === 'terminal')!;
    const result = await tool.execute('call-1', { command: ['pwd'] });
    expect(result.content[0]).toEqual({ type: 'text', text: '/workspace:pwd' });
  });

  test('file tools reject traversal outside /workspace', async () => {
    const tool = createAgentRuntimeTools(runtime(), 'sbx-1').find((item) => item.name === 'file_read')!;
    await expect(tool.execute('call-1', { path: '../etc/passwd' })).rejects.toThrow('必须位于 /workspace');
  });
});
