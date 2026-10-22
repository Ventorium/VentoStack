import type {
  AgentRuntimeClient,
  RuntimeCommandOptions,
  RuntimeCommandResult,
  RuntimeFileEntry,
  RuntimeHostInfo,
  RuntimeSandbox,
} from './types';

export interface AgentRuntimeConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

export interface RuntimePackageBindings {
  request(
    baseUrl: string,
    token: string,
    method: string,
    path: string,
    bodyJson?: string,
  ): Promise<string>;
  requestBinary(
    baseUrl: string,
    token: string,
    method: string,
    path: string,
    body?: Buffer,
  ): Promise<Buffer>;
}

interface RuntimeCommandResponse {
  commandId?: string;
  exitCode: number | null;
  stdout: number[];
  stderr: number[];
  timedOut: boolean;
  durationMs?: number;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function unavailableError(message = 'Agent Runtime 不可用'): Error {
  return Object.assign(new Error(message), {
    code: 'AGENT_RUNTIME_UNAVAILABLE',
    status: 503,
  });
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, redact?: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(unavailableError('Agent Runtime 请求超时')),
      timeoutMs,
    );
  });
  return Promise.race([operation, timeout])
    .catch((error: unknown) => {
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'AGENT_RUNTIME_UNAVAILABLE') throw error;
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = redact ? rawMessage.split(redact).join('***') : rawMessage;
      throw unavailableError(`Agent Runtime 不可用${message ? `：${message}` : ''}`);
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });
}

function normalizeCommandOptions(
  options?: RuntimeCommandOptions | string,
): RuntimeCommandOptions {
  if (typeof options === 'string') return { cwd: options };
  return options ?? {};
}

export function createAgentRuntimeClient(
  config: AgentRuntimeConfig,
  bindings: RuntimePackageBindings,
): AgentRuntimeClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const request = (method: string, path: string, body?: unknown): Promise<string> =>
    withTimeout(
      bindings.request(
        baseUrl,
        config.token,
        method,
        path,
        body === undefined ? undefined : JSON.stringify(body),
      ),
      config.timeoutMs,
      config.token,
    );
  const requestBinary = (
    method: string,
    path: string,
    body?: Uint8Array,
  ): Promise<Buffer> =>
    withTimeout(
      bindings.requestBinary(
        baseUrl,
        config.token,
        method,
        path,
        body ? Buffer.from(body) : undefined,
      ),
      config.timeoutMs,
      config.token,
    );
  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    JSON.parse(await request(method, path, body)) as T;

  return {
    async createSandbox(body): Promise<RuntimeSandbox> {
      const { networkEnabled, ...rest } = body;
      return json('POST', '/sandboxes', {
        ...rest,
        ...(networkEnabled === undefined ? {} : { network: { enabled: networkEnabled } }),
      });
    },
    async listSandboxes(): Promise<RuntimeSandbox[]> {
      const result = await json<RuntimeSandbox[] | { sandboxes?: RuntimeSandbox[] }>(
        'GET',
        '/sandboxes',
      );
      return Array.isArray(result) ? result : (result.sandboxes ?? []);
    },
    async getSandbox(sandboxId): Promise<RuntimeSandbox> {
      return json('GET', `/sandboxes/${encodeURIComponent(sandboxId)}`);
    },
    async destroySandbox(sandboxId): Promise<void> {
      await request('DELETE', `/sandboxes/${encodeURIComponent(sandboxId)}`);
    },
    async startSandbox(sandboxId): Promise<RuntimeSandbox> {
      return json('POST', `/sandboxes/${encodeURIComponent(sandboxId)}/start`);
    },
    async pauseSandbox(sandboxId): Promise<RuntimeSandbox> {
      return json('POST', `/sandboxes/${encodeURIComponent(sandboxId)}/pause`);
    },
    async resumeSandbox(sandboxId): Promise<RuntimeSandbox> {
      return json('POST', `/sandboxes/${encodeURIComponent(sandboxId)}/resume`);
    },
    async stopSandbox(sandboxId): Promise<RuntimeSandbox> {
      return json('POST', `/sandboxes/${encodeURIComponent(sandboxId)}/stop`);
    },
    async runCommand(
      sandboxId,
      command,
      rawOptions,
    ): Promise<RuntimeCommandResult> {
      const options = normalizeCommandOptions(rawOptions);
      const result = await json<RuntimeCommandResponse>(
        'POST',
        `/sandboxes/${encodeURIComponent(sandboxId)}/commands`,
        {
          command,
          cwd: options.cwd ?? '/workspace',
          ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
          ...(options.stdin === undefined ? {} : { stdin: Array.from(options.stdin) }),
        },
      );
      const decoder = new TextDecoder();
      return {
        exitCode: result.exitCode,
        stdout: decoder.decode(Uint8Array.from(result.stdout)),
        stderr: decoder.decode(Uint8Array.from(result.stderr)),
        timedOut: result.timedOut,
        ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
        ...(result.commandId === undefined ? {} : { commandId: result.commandId }),
      };
    },
    async killCommand(sandboxId, commandId): Promise<void> {
      await request(
        'POST',
        `/sandboxes/${encodeURIComponent(sandboxId)}/commands/${encodeURIComponent(commandId)}/kill`,
      );
    },
    readFile(sandboxId, path): Promise<Uint8Array> {
      return requestBinary(
        'GET',
        `/sandboxes/${encodeURIComponent(sandboxId)}/files/content?path=${encodeURIComponent(path)}`,
      );
    },
    async writeFile(sandboxId, path, content): Promise<void> {
      await requestBinary(
        'PUT',
        `/sandboxes/${encodeURIComponent(sandboxId)}/files/content?path=${encodeURIComponent(path)}`,
        content,
      );
    },
    async removeFile(sandboxId, path, recursive = false): Promise<void> {
      await request(
        'DELETE',
        `/sandboxes/${encodeURIComponent(sandboxId)}/files?path=${encodeURIComponent(path)}&recursive=${recursive ? 'true' : 'false'}`,
      );
    },
    async listDir(sandboxId, path): Promise<RuntimeFileEntry[]> {
      return json(
        'GET',
        `/sandboxes/${encodeURIComponent(sandboxId)}/files?path=${encodeURIComponent(path)}`,
      );
    },
    async health(): Promise<void> {
      await request('GET', '/health');
    },
    async info(): Promise<RuntimeHostInfo> {
      return json('GET', '/info');
    },
  };
}
