import { describe, expect, test } from 'bun:test';
import { createAgentRuntimeClient } from '../../agent-runtime/client';

describe('Agent Runtime client', () => {
  test('uses package request functions with configured endpoint and token', async () => {
    const calls: unknown[][] = [];
    const client = createAgentRuntimeClient(
      { baseUrl: 'http://runtime.internal:8088/', token: 'secret', timeoutMs: 1000 },
      {
        async request(...args) {
          calls.push(args);
          return JSON.stringify({ sandboxId: 'sbx-1', state: 'RUNNING' });
        },
        async requestBinary() { return Buffer.from(''); },
      },
    );

    await expect(client.createSandbox({ sessionId: 'agent-1' })).resolves.toEqual({
      sandboxId: 'sbx-1',
      state: 'RUNNING',
    });
    expect(calls[0]).toEqual([
      'http://runtime.internal:8088',
      'secret',
      'POST',
      '/sandboxes',
      JSON.stringify({ sessionId: 'agent-1' }),
    ]);
  });

  test('maps transport failures to a service-unavailable error without leaking the token', async () => {
    const client = createAgentRuntimeClient(
      { baseUrl: 'http://runtime.internal:8088', token: 'top-secret', timeoutMs: 1000 },
      {
        async request() { throw new Error('connect ECONNREFUSED top-secret'); },
        async requestBinary() { throw new Error('unused'); },
      },
    );
    try {
      await client.getSandbox('sbx-1');
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toMatchObject({ code: 'AGENT_RUNTIME_UNAVAILABLE', status: 503 });
      expect(String(error)).not.toContain('top-secret');
    }
  });
});
