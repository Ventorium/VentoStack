// @aeron/core - 请求上下文

export interface Context {
  readonly request: Request;
  readonly url: URL;
  readonly method: string;
  readonly path: string;
  readonly params: Record<string, string>;
  readonly query: Record<string, string>;
  readonly headers: Headers;
  readonly state: Map<string, unknown>;
  readonly startTime: number;

  // 用户/租户 (中间件注入)
  user?: unknown;
  tenant?: unknown;

  // 响应方法
  json(data: unknown, status?: number): Response;
  text(data: string, status?: number): Response;
  html(data: string, status?: number): Response;
  redirect(url: string, status?: number): Response;
  stream(body: ReadableStream, contentType?: string): Response;
}

export function createContext(
  request: Request,
  params?: Record<string, string>,
): Context {
  const url = new URL(request.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  return {
    request,
    url,
    method: request.method,
    path: url.pathname,
    params: params ?? {},
    query,
    headers: request.headers,
    state: new Map(),
    startTime: performance.now(),
    user: undefined,
    tenant: undefined,

    json(data: unknown, status = 200): Response {
      return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },

    text(data: string, status = 200): Response {
      return new Response(data, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    },

    html(data: string, status = 200): Response {
      return new Response(data, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },

    redirect(url: string, status = 302): Response {
      return new Response(null, {
        status,
        headers: { Location: url },
      });
    },

    stream(
      body: ReadableStream,
      contentType = "application/octet-stream",
    ): Response {
      return new Response(body, {
        headers: { "Content-Type": contentType },
      });
    },
  };
}
