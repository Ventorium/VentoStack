// @aeron/core - 内部 RPC（service-to-service）

export interface RPCMethod<TReq = unknown, TRes = unknown> {
  name: string;
  handler: (request: TReq) => Promise<TRes>;
}

export interface RPCRouter {
  register<TReq, TRes>(name: string, handler: (request: TReq) => Promise<TRes>): void;
  call<TReq, TRes>(name: string, request: TReq): Promise<TRes>;
  methods(): string[];
}

export interface RPCClient {
  call<TReq, TRes>(method: string, request: TReq): Promise<TRes>;
}

export interface RPCClientOptions {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * 创建内部 RPC 路由器（进程内调用）
 */
export function createRPCRouter(): RPCRouter {
  const handlers = new Map<string, (request: unknown) => Promise<unknown>>();

  return {
    register<TReq, TRes>(name: string, handler: (request: TReq) => Promise<TRes>): void {
      if (handlers.has(name)) {
        throw new Error(`RPC method already registered: ${name}`);
      }
      handlers.set(name, handler as (request: unknown) => Promise<unknown>);
    },

    async call<TReq, TRes>(name: string, request: TReq): Promise<TRes> {
      const handler = handlers.get(name);
      if (!handler) {
        throw new Error(`RPC method not found: ${name}`);
      }
      const result = await handler(request);
      return result as TRes;
    },

    methods(): string[] {
      return Array.from(handlers.keys());
    },
  };
}

/**
 * 创建 HTTP RPC 客户端（跨服务调用）
 */
export function createRPCClient(options: RPCClientOptions): RPCClient {
  const { baseUrl, timeout = 30000, headers = {} } = options;

  return {
    async call<TReq, TRes>(method: string, request: TReq): Promise<TRes> {
      const url = `${baseUrl}/rpc/${method}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`RPC call failed: ${method} - ${response.status} ${error}`);
        }

        return (await response.json()) as TRes;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
