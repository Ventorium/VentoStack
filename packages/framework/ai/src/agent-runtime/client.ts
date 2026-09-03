import type { AgentRuntimeClient, RuntimeSandbox } from './types';

export interface AgentRuntimeConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

export interface RuntimePackageBindings {
  request(baseUrl: string, token: string, method: string, path: string, bodyJson?: string): Promise<string>;
  requestBinary(baseUrl: string, token: string, method: string, path: string, body?: Buffer): Promise<Buffer>;
}

interface RuntimeCommandResponse {
  exitCode: number | null;
  stdout: number[];
  stderr: number[];
  timedOut: boolean;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Agent Runtime 请求超时'), {
      code: 'AGENT_RUNTIME_UNAVAILABLE', status: 503,
    })), timeoutMs);
  });
  return Promise.race([operation, timeout])
    .catch(() => {
      throw Object.assign(new Error('Agent Runtime 不可用'), {
        code: 'AGENT_RUNTIME_UNAVAILABLE', status: 503,
      });
    })
    .finally(() => timer && clearTimeout(timer));
}

export function createAgentRuntimeClient(
  config: AgentRuntimeConfig,
  bindings: RuntimePackageBindings,
): AgentRuntimeClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const request = (method: string, path: string, body?: unknown): Promise<string> =>
    withTimeout(
      bindings.request(baseUrl, config.token, method, path, body === undefined ? undefined : JSON.stringify(body)),
      config.timeoutMs,
    );
  const requestBinary = (method: string, path: string, body?: Uint8Array): Promise<Buffer> =>
    withTimeout(
      bindings.requestBinary(baseUrl, config.token, method, path, body ? Buffer.from(body) : undefined),
      config.timeoutMs,
    );

  return {
    async createSandbox(body): Promise<RuntimeSandbox> {
      return JSON.parse(await request('POST', '/sandboxes', body)) as RuntimeSandbox;
    },
    async getSandbox(sandboxId): Promise<RuntimeSandbox> {
      return JSON.parse(await request('GET', `/sandboxes/${encodeURIComponent(sandboxId)}`)) as RuntimeSandbox;
    },
    async destroySandbox(sandboxId): Promise<void> {
      await request('DELETE', `/sandboxes/${encodeURIComponent(sandboxId)}`);
    },
    async runCommand(sandboxId, command, cwd = '/workspace') {
      const result = JSON.parse(await request(
        'POST',
        `/sandboxes/${encodeURIComponent(sandboxId)}/commands`,
        { command, cwd },
      )) as RuntimeCommandResponse;
      const decoder = new TextDecoder();
      return {
        exitCode: result.exitCode,
        stdout: decoder.decode(Uint8Array.from(result.stdout)),
        stderr: decoder.decode(Uint8Array.from(result.stderr)),
        timedOut: result.timedOut,
      };
    },
    readFile(sandboxId, path): Promise<Uint8Array> {
      return requestBinary('GET', `/sandboxes/${encodeURIComponent(sandboxId)}/files/content?path=${encodeURIComponent(path)}`);
    },
    async writeFile(sandboxId, path, content): Promise<void> {
      await requestBinary('PUT', `/sandboxes/${encodeURIComponent(sandboxId)}/files/content?path=${encodeURIComponent(path)}`, content);
    },
  };
}
