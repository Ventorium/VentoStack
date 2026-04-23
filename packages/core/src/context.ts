// @ventostack/core - 请求上下文

/** 带类型的 Response（phantom type，仅用于编译期推导） */
export type TypedResponse<T = unknown> = Response & { __data?: T };

/**
 * 请求状态对象，可通过模块扩展声明自定义字段。
 *
 * @example
 * ```typescript
 * declare module "@ventostack/core" {
 *   interface ContextState {
 *     user?: { id: string; name: string };
 *     tenant?: string;
 *   }
 * }
 * ```
 */
export interface ContextState {
  [key: string]: unknown;
}

/** HTTP 请求上下文接口，包含请求信息、参数及响应辅助方法 */
export interface Context<
  TParams extends Record<string, unknown> = Record<string, string>,
  TQuery extends Record<string, unknown> = Record<string, string>,
  TBody extends Record<string, unknown> = Record<string, unknown>,
  TFormData extends Record<string, unknown> = Record<string, unknown>,
  TResponse = unknown,
> {
  /** 原始 Request 对象 */
  readonly request: Request;
  /** 解析后的 URL 对象 */
  readonly url: URL;
  /** HTTP 方法（如 GET、POST） */
  readonly method: string;
  /** 请求路径 */
  readonly path: string;
  /** 路由参数 */
  readonly params: TParams;
  /** URL 查询参数对象 */
  readonly query: TQuery;
  /** 请求体（声明 body schema 时自动注入） */
  readonly body: TBody;
  /** 请求头（原生 Headers） */
  readonly headers: Headers;
  /** FormData（声明 formData schema 时自动注入） */
  readonly formData: TFormData;
  /** 可在中间件间共享的状态存储 */
  readonly state: ContextState;
  /** 请求开始时间戳（performance.now()） */
  readonly startTime: number;

  // 用户/租户（由中间件注入）
  /** 当前用户（需认证中间件注入） */
  user?: unknown;
  /** 当前租户（需租户中间件注入） */
  tenant?: unknown;

  // 响应方法
  /**
   * 返回 JSON 响应
   * @param data - 响应数据
   * @param status - HTTP 状态码，默认 200
   * @returns Response 对象
   */
  json(data: TResponse, status?: number, headers?: Record<string, string>): TypedResponse<TResponse>;
  /**
   * 返回纯文本响应
   * @param data - 文本内容
   * @param status - HTTP 状态码，默认 200
   * @returns Response 对象
   */
  text(data: string, status?: number): Response;
  /**
   * 返回 HTML 响应
   * @param data - HTML 内容
   * @param status - HTTP 状态码，默认 200
   * @returns Response 对象
   */
  html(data: string, status?: number): Response;
  /**
   * 返回重定向响应
   * @param url - 跳转目标地址
   * @param status - HTTP 状态码，默认 302
   * @returns Response 对象
   */
  redirect(url: string, status?: number): Response;
  /**
   * 返回流式响应
   * @param body - 可读流
   * @param contentType - Content-Type，默认 application/octet-stream
   * @returns Response 对象
   */
  stream(body: ReadableStream, contentType?: string): Response;
}

/**
 * 创建请求上下文
 * @param request - 原始 Request 对象
 * @param params - 路由参数
 * @returns Context 实例
 */
export function createContext<TParams extends Record<string, unknown> = Record<string, string>>(
  request: Request,
  params?: TParams,
): Context<TParams> {
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
    params: params ?? ({} as TParams),
    query,
    body: {} as Record<string, unknown>,
    headers: request.headers,
    formData: {} as Record<string, unknown>,
    state: {} as ContextState,
    startTime: performance.now(),
    user: undefined,
    tenant: undefined,

    json<T>(data: T, status = 200, headers?: Record<string, string>): TypedResponse<T> {
      const h = new Headers({ "Content-Type": "application/json" });
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          h.set(k, v);
        }
      }
      return new Response(JSON.stringify(data), {
        status,
        headers: h,
      }) as TypedResponse<T>;
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

    stream(body: ReadableStream, contentType = "application/octet-stream"): Response {
      return new Response(body, {
        headers: { "Content-Type": contentType },
      });
    },
  };
}
