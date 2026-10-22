import { describe, expect, test } from 'bun:test';
import { createAgentRuntimeTools, isDangerousCommand } from '../../agent-runtime/tools';
import type { AgentRuntimeClient } from '../../agent-runtime/types';

function runtime(overrides: Partial<AgentRuntimeClient> = {}): AgentRuntimeClient {
  return {
    async createSandbox() { throw new Error('unused'); },
    async getSandbox() { throw new Error('unused'); },
    async destroySandbox() {},
    async runCommand(_id, command, cwd) { const dir = typeof cwd === 'string' ? cwd : (cwd?.cwd ?? ''); return { exitCode: 0, stdout: `${dir}:${command.join(' ')}`, stderr: '', timedOut: false }; },
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
    await expect(tool.execute('call-1', { path: '../etc/passwd' })).rejects.toThrow('必须位于当前会话工作区');
  });

  test('isolates a session workspace and reports written artifacts', async () => {
    const written: string[] = [];
    const tools = createAgentRuntimeTools(runtime(), 'sbx-1', {
      workspace: '/workspace/sessions/session-1',
      async onFileWritten(path) { written.push(path); },
    });
    const write = tools.find((item) => item.name === 'file_write')!;
    await write.execute('call-1', { path: 'reports/today.md', content: 'done' });
    expect(written).toEqual(['reports/today.md']);
  });
});

describe('VM command policy', () => {
  test('blocks destructive root operations', () => {
    expect(isDangerousCommand(['rm', '-rf', '/'])).toBeTruthy();
    expect(isDangerousCommand(['mkfs.ext4', '/dev/sda1'])).toBeTruthy();
    expect(isDangerousCommand(['dd', 'if=/dev/zero', 'of=/dev/sda'])).toBeTruthy();
    expect(isDangerousCommand(['shutdown', '-h', 'now'])).toBeTruthy();
  });

  test('allows normal exploration commands', () => {
    expect(isDangerousCommand(['rg', 'foo', '/workspace'])).toBeNull();
    expect(isDangerousCommand(['ls', '-al'])).toBeNull();
    expect(isDangerousCommand(['cat', '/workspace/a.md'])).toBeNull();
  });
});
