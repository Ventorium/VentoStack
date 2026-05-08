// @ventostack/core - 路由系统

import { type Context, createContext, type TypedResponse } from "./context";
import { type Middleware, compose } from "./middleware";
import { ValidationError } from "./errors";
import { type ParamType, type ParamTypeMap, isValidParamType, paramTypes } from "./param-constraint";
import type { RouteSchemaConfig, InferSchema, InferResponseType, RouteResponseDefinition, SchemaField } from "./schema-types";
import {
  coerceAndValidate,
  coerceAndValidateJSONBody,
  coerceAndValidateFormBody,
  coerceAndValidateFormDataBody,
  resolveRouteResponseDefinition,
  validateResponseData,
} from "./schema-types";

/** 路由配置（声明式接口契约） */
export interface RouteConfig extends RouteSchemaConfig {}

export function defineRouteConfig<const TConfig extends RouteConfig>(config: RouteConfig & TConfig): TConfig {
  return config;
}

/** 路由处理器类型 */
export type RouteHandler<
  TParams extends Record<string, unknown> = Record<string, string>,
  TQuery extends Record<string, unknown> = Record<string, string>,
  TBody extends Record<string, unknown> = Record<string, unknown>,
  TFormData extends Record<string, unknown> = Record<string, unknown>,
  TResponse = unknown,
> = (
  ctx: Context<TParams, TQuery, TBody, TFormData, TResponse>,
) => Promise<TypedResponse<TResponse> | Response> | TypedResponse<TResponse> | Response;

type BunRouteHandler = (req: Request) => Response | Promise<Response>;

/** 编译后的路由表类型 */
export type CompiledRoutes = Record<string, BunRouteHandler | Record<string, BunRouteHandler>>;

/** 解析后的路由参数定义 */
export interface ParsedParam {
  /** 参数名 */
  name: string;
  /** 参数类型 */
  type: ParamType;
  /** 自定义正则表达式 */
  customRegex?: string | undefined;
}

/** 解析后的路由信息 */
export interface ParsedRoute {
  /** 原始路径 */
  originalPath: string;
  /** 去除类型约束后的路径 */
  strippedPath: string;
  /** 参数定义列表 */
  params: ParsedParam[];
}

/** 路由定义 */
export interface RouteDefinition {
  /** HTTP 方法 */
  method: string;
  /** 原始路径 */
  path: string;
  /** 去除类型约束后的路径 */
  strippedPath: string;
  /** 路由处理器 */
  handler: RouteHandler;
  /** 路由级中间件 */
  middleware: Middleware[];
  /** 路由元数据（如 OpenAPI 信息） */
  metadata?: Record<string, unknown>;
  /** 参数定义列表 */
  params: ParsedParam[];
  /** 路由 schema 配置 */
  schemaConfig?: RouteConfig | undefined;
}

/** REST 资源处理器集合 */
export interface ResourceHandlers {
  /** 列表查询 */
  index?: RouteHandler;
  /** 详情查询 */
  show?: RouteHandler;
  /** 创建 */
  create?: RouteHandler;
  /** 更新 */
  update?: RouteHandler;
  /** 删除 */
  destroy?: RouteHandler;
}

/** 类型推导工具：从路径字符串字面量提取参数类型 */
type InferParamSegment<Segment extends string> = Segment extends `${infer Name}<${infer Type}>${string}`
  ? { [K in Name]: ParamTypeMap[Type extends ParamType ? Type : "string"] }
  : Segment extends `${infer Name}(${string}`
    ? { [K in Name]: string }
  : { [K in Segment]: string };

export type InferParams<Path extends string> = Path extends `${infer _Start}:${infer Segment}/${infer Rest}`
  ? InferParamSegment<Segment> & InferParams<`/${Rest}`>
  : Path extends `${infer _Start}:${infer Segment}`
    ? InferParamSegment<Segment>
    : Record<string, never>;

function isParamNameChar(char: string, isFirst = false): boolean {
  const code = char.charCodeAt(0);
  const isLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  const isDigit = code >= 48 && code <= 57;
  return isFirst ? isLetter || char === "_" : isLetter || isDigit || char === "_";
}

function readBalancedRegex(path: string, startIndex: number): { regex: string; endIndex: number } {
  let depth = 0;
  let escaped = false;
  let value = "";

  for (let i = startIndex; i < path.length; i += 1) {
    const char = path[i]!;
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      value += char;
      escaped = true;
      continue;
    }
    if (char === "(") {
      depth += 1;
      value += char;
      continue;
    }
    if (char === ")") {
      if (depth === 0) {
        return { regex: value, endIndex: i + 1 };
      }
      depth -= 1;
      value += char;
      continue;
    }
    value += char;
  }

  throw new Error(`Unclosed custom regex in route "${path}"`);
}

/**
 * 解析路由路径，提取参数名、类型及自定义正则
 * @param path - 路由路径，如 /users/:id<int>
 * @returns 解析后的路由信息
 */
export function parseRoutePath(path: string): ParsedRoute {
  const params: ParsedParam[] = [];
  const replacements: Array<{ start: number; end: number; name: string }> = [];

  for (let i = 0; i < path.length; i += 1) {
    if (path[i] !== ":") continue;

    const start = i;
    let cursor = i + 1;
    if (cursor >= path.length || !isParamNameChar(path[cursor]!, true)) continue;

    let name = "";
    while (cursor < path.length && isParamNameChar(path[cursor]!)) {
      name += path[cursor];
      cursor += 1;
    }

    let type: ParamType | undefined;
    let customRegex: string | undefined;

    if (cursor < path.length && path[cursor] === "<") {
      cursor += 1;

      const typeStart = cursor;
      while (cursor < path.length && path[cursor] !== ">") {
        cursor += 1;
      }
      if (cursor >= path.length) {
        throw new Error(`Unclosed param type in route "${path}"`);
      }

      const parsedType = path.slice(typeStart, cursor);
      if (!isValidParamType(parsedType)) {
        throw new Error(`Unknown param type "${parsedType}" in route "${path}"`);
      }
      type = parsedType;
      cursor += 1;
    } else if (cursor < path.length && path[cursor] === "(") {
      type = "string";
    } else {
      continue;
    }

    if (cursor < path.length && path[cursor] === "(") {
      const parsedRegex = readBalancedRegex(path, cursor + 1);
      customRegex = parsedRegex.regex;
      cursor = parsedRegex.endIndex;
    }

    params.push({ name, type, customRegex });
    replacements.push({ start, end: cursor, name });
    i = cursor - 1;
  }

  let stripped = "";
  let lastIndex = 0;
  for (const r of replacements) {
    stripped += path.slice(lastIndex, r.start) + `:${r.name}`;
    lastIndex = r.end;
  }
  stripped += path.slice(lastIndex);

  if (stripped.endsWith("/*")) {
    params.push({ name: "*", type: "string", customRegex: ".*" });
  }

  return {
    originalPath: path,
    strippedPath: stripped,
    params,
  };
}

/**
 * 将原始字符串参数按类型约束进行校验与转换
 * @param raw - 原始参数字符串对象
 * @param paramDefs - 参数定义列表
 * @returns 转换后的参数对象
 */
function coerceParams(
  raw: Record<string, string>,
  paramDefs: ParsedParam[],
): Record<string, unknown> {
  const coerced: Record<string, unknown> = { ...raw };

  for (const def of paramDefs) {
    const rawValue = raw[def.name];
    if (rawValue === undefined) continue;

    const typeDef = paramTypes[def.type];
    const pattern = def.customRegex ? new RegExp(`^(?:${def.customRegex})$`) : typeDef.pattern;

    if (!pattern.test(rawValue)) {
      throw new ValidationError(
        `Invalid value for param ":${def.name}": ${typeDef.message ?? "格式不匹配"}`,
      );
    }

    coerced[def.name] = typeDef.coerce(rawValue);
  }

  return coerced;
}

// 辅助类型：schema 不存在时返回兼容的默认类型
type _InferQuery<T> = T extends Record<string, SchemaField> ? InferSchema<T> : Record<string, string>;
type _InferBody<T> = T extends Record<string, SchemaField> ? InferSchema<T> : Record<string, unknown>;
type _InferFormData<T> = T extends Record<string, SchemaField> ? InferSchema<T> : Record<string, unknown>;
type _InferResponse<T> = T extends Record<number | string, infer R>
  ? InferResponseType<R>
  : Record<string, unknown>;

function normalizeContentType(contentType: string | null): string | undefined {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function createResponseValidationError(errors: string[]): Response {
  return new Response(
    JSON.stringify({ error: "RESPONSE_VALIDATION_ERROR", errors }),
    { status: 500, headers: { "Content-Type": "application/json" } },
  );
}

async function validateRouteResponse(
  response: Response,
  responses: Record<number | string, RouteResponseDefinition>,
): Promise<Response> {
  const responseDef = responses[response.status] ?? responses[String(response.status)];
  if (!responseDef) {
    return response;
  }

  const resolved = resolveRouteResponseDefinition(responseDef);
  const expectedContentType = normalizeContentType(resolved.contentType) ?? "application/json";

  // 流式响应在这里无法安全消费 clone() 做完整校验，跳过严格校验。
  if (expectedContentType === "text/event-stream") {
    return response;
  }

  const actualContentType = normalizeContentType(response.headers.get("content-type"));
  if (actualContentType !== undefined && actualContentType !== expectedContentType) {
    return createResponseValidationError([
      `response content-type must be ${expectedContentType}, received ${actualContentType}`,
    ]);
  }

  let rawBody: unknown;
  if (expectedContentType === "application/json") {
    try {
      rawBody = await response.clone().json();
    } catch {
      return createResponseValidationError(["response body is not valid JSON"]);
    }
  } else if (expectedContentType.startsWith("text/")) {
    rawBody = await response.clone().text();
  } else {
    return response;
  }

  let errors = validateResponseData(rawBody, resolved.schema);
  if (
    errors.length > 0 &&
    typeof rawBody === "object" &&
    rawBody !== null &&
    !Array.isArray(rawBody) &&
    "data" in rawBody
  ) {
    errors = validateResponseData((rawBody as { data: unknown }).data, resolved.schema, "response.data");
  }
  if (errors.length > 0) {
    return createResponseValidationError(errors);
  }

  return response;
}

/** 路由器接口 */
export interface Router {
  /**
   * 注册 GET 路由
   * @param path - 路径
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  get<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  /**
   * 注册 GET 路由（中间件在前，处理器在后）
   */
  get<Path extends string>(path: Path, middleware: Middleware, handler: RouteHandler<InferParams<Path>>, ...middlewareList: Middleware[]): Router;
  /**
   * 注册 GET 路由（带 schema 配置）
   * @param path - 路径
   * @param config - 路由配置
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  get<const Path extends string, const TConfig extends RouteConfig>(
    path: Path,
    config: RouteConfig & TConfig,
    handler: RouteHandler<
      InferParams<Path>,
      _InferQuery<TConfig["query"]> extends Record<string, unknown> ? _InferQuery<TConfig["query"]> : Record<string, string>,
      _InferBody<TConfig["body"]> extends Record<string, unknown> ? _InferBody<TConfig["body"]> : Record<string, unknown>,
            _InferFormData<TConfig["formData"]> extends Record<string, unknown> ? _InferFormData<TConfig["formData"]> : Record<string, unknown>,
      _InferResponse<TConfig["responses"]>
    >,
    ...middleware: Middleware[]
  ): Router;
  /**
   * 注册 POST 路由
   * @param path - 路径
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  post<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  /**
   * 注册 POST 路由（中间件在前，处理器在后）
   */
  post<Path extends string>(path: Path, middleware: Middleware, handler: RouteHandler<InferParams<Path>>, ...middlewareList: Middleware[]): Router;
  /**
   * 注册 POST 路由（带 schema 配置）
   * @param path - 路径
   * @param config - 路由配置
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  post<const Path extends string, const TConfig extends RouteConfig>(
    path: Path,
    config: RouteConfig & TConfig,
    handler: RouteHandler<
      InferParams<Path>,
      _InferQuery<TConfig["query"]> extends Record<string, unknown> ? _InferQuery<TConfig["query"]> : Record<string, string>,
      _InferBody<TConfig["body"]> extends Record<string, unknown> ? _InferBody<TConfig["body"]> : Record<string, unknown>,
            _InferFormData<TConfig["formData"]> extends Record<string, unknown> ? _InferFormData<TConfig["formData"]> : Record<string, unknown>,
      _InferResponse<TConfig["responses"]>
    >,
    ...middleware: Middleware[]
  ): Router;
  /**
   * 注册 PUT 路由
   * @param path - 路径
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  put<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  /**
   * 注册 PUT 路由（中间件在前，处理器在后）
   */
  put<Path extends string>(path: Path, middleware: Middleware, handler: RouteHandler<InferParams<Path>>, ...middlewareList: Middleware[]): Router;
  /**
   * 注册 PUT 路由（带 schema 配置）
   * @param path - 路径
   * @param config - 路由配置
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  put<const Path extends string, const TConfig extends RouteConfig>(
    path: Path,
    config: RouteConfig & TConfig,
    handler: RouteHandler<
      InferParams<Path>,
      _InferQuery<TConfig["query"]> extends Record<string, unknown> ? _InferQuery<TConfig["query"]> : Record<string, string>,
      _InferBody<TConfig["body"]> extends Record<string, unknown> ? _InferBody<TConfig["body"]> : Record<string, unknown>,
            _InferFormData<TConfig["formData"]> extends Record<string, unknown> ? _InferFormData<TConfig["formData"]> : Record<string, unknown>,
      _InferResponse<TConfig["responses"]>
    >,
    ...middleware: Middleware[]
  ): Router;
  /**
   * 注册 PATCH 路由
   * @param path - 路径
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  patch<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  /**
   * 注册 PATCH 路由（中间件在前，处理器在后）
   */
  patch<Path extends string>(path: Path, middleware: Middleware, handler: RouteHandler<InferParams<Path>>, ...middlewareList: Middleware[]): Router;
  /**
   * 注册 PATCH 路由（带 schema 配置）
   * @param path - 路径
   * @param config - 路由配置
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  patch<const Path extends string, const TConfig extends RouteConfig>(
    path: Path,
    config: RouteConfig & TConfig,
    handler: RouteHandler<
      InferParams<Path>,
      _InferQuery<TConfig["query"]> extends Record<string, unknown> ? _InferQuery<TConfig["query"]> : Record<string, string>,
      _InferBody<TConfig["body"]> extends Record<string, unknown> ? _InferBody<TConfig["body"]> : Record<string, unknown>,
            _InferFormData<TConfig["formData"]> extends Record<string, unknown> ? _InferFormData<TConfig["formData"]> : Record<string, unknown>,
      _InferResponse<TConfig["responses"]>
    >,
    ...middleware: Middleware[]
  ): Router;
  /**
   * 注册 DELETE 路由
   * @param path - 路径
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  delete<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  /**
   * 注册 DELETE 路由（中间件在前，处理器在后）
   */
  delete<Path extends string>(path: Path, middleware: Middleware, handler: RouteHandler<InferParams<Path>>, ...middlewareList: Middleware[]): Router;
  /**
   * 注册 DELETE 路由（带 schema 配置）
   * @param path - 路径
   * @param config - 路由配置
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  delete<const Path extends string, const TConfig extends RouteConfig>(
    path: Path,
    config: RouteConfig & TConfig,
    handler: RouteHandler<
      InferParams<Path>,
      _InferQuery<TConfig["query"]> extends Record<string, unknown> ? _InferQuery<TConfig["query"]> : Record<string, string>,
      _InferBody<TConfig["body"]> extends Record<string, unknown> ? _InferBody<TConfig["body"]> : Record<string, unknown>,
            _InferFormData<TConfig["formData"]> extends Record<string, unknown> ? _InferFormData<TConfig["formData"]> : Record<string, unknown>,
      _InferResponse<TConfig["responses"]>
    >,
    ...middleware: Middleware[]
  ): Router;
  /**
   * 创建路由分组
   * @param prefix - 分组前缀
   * @param callback - 分组路由注册回调
   * @param middleware - 分组中间件
   */
  group(prefix: string, callback: (group: Router) => void, ...middleware: Middleware[]): Router;
  /**
   * 注册全局中间件
   * @param middleware - 中间件列表
   */
  use(...middleware: Middleware[]): Router;
  /**
   * 注册 REST 资源路由
   * @param prefix - 资源前缀
   * @param handlers - 资源处理器
   * @param middleware - 可选中间件
   */
  resource(prefix: string, handlers: ResourceHandlers, ...middleware: Middleware[]): Router;
  /**
   * 注册命名路由
   * @param name - 路由名称
   * @param method - HTTP 方法
   * @param path - 路径
   * @param handler - 处理器
   * @param middleware - 可选中间件
   */
  namedRoute(
    name: string,
    method: string,
    path: string,
    handler: RouteHandler,
    ...middleware: Middleware[]
  ): Router;
  /**
   * 根据命名路由生成 URL
   * @param name - 路由名称
   * @param params - 路径参数
   * @returns 生成的 URL 路径
   */
  url(name: string, params?: Record<string, string>): string;
  /** 获取所有路由定义 */
  routes(): readonly RouteDefinition[];
  /**
   * 编译路由为 Bun 可识别的格式
   * @param globalMiddleware - 全局中间件
   */
  compile(globalMiddleware?: Middleware[]): CompiledRoutes;
  /**
   * 为已有路由附加元数据（如 OpenAPI 文档信息）
   * @param method - HTTP 方法
   * @param path - 路径
   * @param metadata - 元数据对象
   */
  doc(method: string, path: string, metadata: Record<string, unknown>): Router;
  /**
   * 将另一个 Router 的路由合并到当前 Router
   * @param router - 要合并的路由器
   */
  merge(router: Router): Router;
}

/**
 * 创建路由器实例
 * @returns Router 实例
 */
export function createRouter(): Router {
  const routeDefs: RouteDefinition[] = [];
  const routerMiddleware: Middleware[] = [];
  const namedRoutes = new Map<string, string>();

  function addRoute(
    method: string,
    path: string,
    handler: RouteHandler,
    middleware: Middleware[],
    schemaConfig?: RouteConfig,
  ): Router {
    const parsed = parseRoutePath(path);
    let metadata: Record<string, unknown> | undefined;
    if (schemaConfig?.openapi) {
      metadata = { openapi: schemaConfig.openapi };
    } else if (schemaConfig?.metadata) {
      metadata = schemaConfig.metadata;
    }
    routeDefs.push({
      method: method.toUpperCase(),
      path,
      strippedPath: parsed.strippedPath,
      handler,
      middleware,
      params: parsed.params,
      schemaConfig,
      ...(metadata !== undefined ? { metadata } : {}),
    });
    return router;
  }

  const router: Router = {
    get: ((path: string, arg2: RouteHandler | RouteConfig | Middleware, ...rest: Array<RouteHandler | Middleware>) => {
      if (typeof arg2 === "function") {
        if (arg2.length >= 2 && typeof rest[0] === "function") {
          return addRoute("GET", path, rest[0] as RouteHandler, [arg2 as Middleware, ...(rest.slice(1) as Middleware[])]);
        }
        return addRoute("GET", path, arg2 as RouteHandler, rest as Middleware[]);
      }
      const config = arg2;
      const handler = rest[0] as RouteHandler;
      const mw = rest.slice(1) as Middleware[];
      return addRoute("GET", path, handler, mw, config);
    }) as Router["get"],
    post: ((path: string, arg2: RouteHandler | RouteConfig | Middleware, ...rest: Array<RouteHandler | Middleware>) => {
      if (typeof arg2 === "function") {
        if (arg2.length >= 2 && typeof rest[0] === "function") {
          return addRoute("POST", path, rest[0] as RouteHandler, [arg2 as Middleware, ...(rest.slice(1) as Middleware[])]);
        }
        return addRoute("POST", path, arg2 as RouteHandler, rest as Middleware[]);
      }
      const config = arg2;
      const handler = rest[0] as RouteHandler;
      const mw = rest.slice(1) as Middleware[];
      return addRoute("POST", path, handler, mw, config);
    }) as Router["post"],
    put: ((path: string, arg2: RouteHandler | RouteConfig | Middleware, ...rest: Array<RouteHandler | Middleware>) => {
      if (typeof arg2 === "function") {
        if (arg2.length >= 2 && typeof rest[0] === "function") {
          return addRoute("PUT", path, rest[0] as RouteHandler, [arg2 as Middleware, ...(rest.slice(1) as Middleware[])]);
        }
        return addRoute("PUT", path, arg2 as RouteHandler, rest as Middleware[]);
      }
      const config = arg2;
      const handler = rest[0] as RouteHandler;
      const mw = rest.slice(1) as Middleware[];
      return addRoute("PUT", path, handler, mw, config);
    }) as Router["put"],
    patch: ((path: string, arg2: RouteHandler | RouteConfig | Middleware, ...rest: Array<RouteHandler | Middleware>) => {
      if (typeof arg2 === "function") {
        if (arg2.length >= 2 && typeof rest[0] === "function") {
          return addRoute("PATCH", path, rest[0] as RouteHandler, [arg2 as Middleware, ...(rest.slice(1) as Middleware[])]);
        }
        return addRoute("PATCH", path, arg2 as RouteHandler, rest as Middleware[]);
      }
      const config = arg2;
      const handler = rest[0] as RouteHandler;
      const mw = rest.slice(1) as Middleware[];
      return addRoute("PATCH", path, handler, mw, config);
    }) as Router["patch"],
    delete: ((path: string, arg2: RouteHandler | RouteConfig | Middleware, ...rest: Array<RouteHandler | Middleware>) => {
      if (typeof arg2 === "function") {
        if (arg2.length >= 2 && typeof rest[0] === "function") {
          return addRoute("DELETE", path, rest[0] as RouteHandler, [arg2 as Middleware, ...(rest.slice(1) as Middleware[])]);
        }
        return addRoute("DELETE", path, arg2 as RouteHandler, rest as Middleware[]);
      }
      const config = arg2;
      const handler = rest[0] as RouteHandler;
      const mw = rest.slice(1) as Middleware[];
      return addRoute("DELETE", path, handler, mw, config);
    }) as Router["delete"],

    group(prefix, callback, ...groupMiddleware) {
      const subRouter = createRouter();
      callback(subRouter);
      for (const route of subRouter.routes()) {
        routeDefs.push({
          ...route,
          path: prefix + route.path,
          strippedPath: prefix + route.strippedPath,
          middleware: [...groupMiddleware, ...route.middleware],
        });
      }
      return router;
    },

    use(...mw) {
      routerMiddleware.push(...mw);
      return router;
    },

    resource(prefix, handlers, ...mw) {
      if (handlers.index) {
        addRoute("GET", prefix, handlers.index, mw);
      }
      if (handlers.create) {
        addRoute("POST", prefix, handlers.create, mw);
      }
      if (handlers.show) {
        addRoute("GET", `${prefix}/:id`, handlers.show, mw);
      }
      if (handlers.update) {
        addRoute("PUT", `${prefix}/:id`, handlers.update, mw);
      }
      if (handlers.destroy) {
        addRoute("DELETE", `${prefix}/:id`, handlers.destroy, mw);
      }
      return router;
    },

    namedRoute(name, method, path, handler, ...mw) {
      if (namedRoutes.has(name)) {
        throw new Error(`Route name "${name}" is already registered`);
      }
      const parsed = parseRoutePath(path);
      namedRoutes.set(name, parsed.strippedPath);
      addRoute(method.toUpperCase(), path, handler, mw);
      return router;
    },

    url(name, params) {
      const path = namedRoutes.get(name);
      if (path === undefined) {
        throw new Error(`Route name "${name}" not found`);
      }
      if (!params) {
        return path;
      }
      let result = path;
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(`:${key}`, value);
      }
      return result;
    },

    routes(): readonly RouteDefinition[] {
      return routeDefs.map((route) => ({
        ...route,
        middleware: [...routerMiddleware, ...route.middleware],
      }));
    },

    doc(method: string, path: string, metadata: Record<string, unknown>): Router {
      const upper = method.toUpperCase();
      const target = routeDefs.find((r) => r.method === upper && r.path === path);
      if (target) {
        target.metadata = { ...target.metadata, ...metadata };
      }
      return router;
    },

    merge(other: Router): Router {
      for (const route of other.routes()) {
        const entry: RouteDefinition = {
          method: route.method,
          path: route.path,
          strippedPath: route.strippedPath,
          handler: route.handler,
          middleware: route.middleware,
          params: route.params,
          schemaConfig: route.schemaConfig,
        };
        if (route.metadata !== undefined) {
          entry.metadata = route.metadata;
        }
        routeDefs.push(entry);
      }
      return router;
    },

    compile(globalMiddleware: Middleware[] = []): CompiledRoutes {
      const finalRoutes = router.routes();

      // 路由冲突检测（基于 strippedPath）
      const seen = new Set<string>();
      for (const route of finalRoutes) {
        const key = `${route.method} ${route.strippedPath || "/"}`;
        if (seen.has(key)) {
          throw new Error(`Duplicate route detected: ${route.method} ${route.strippedPath || "/"}`);
        }
        seen.add(key);
      }

      const compiled: Record<string, Record<string, BunRouteHandler>> = {};

      for (const route of finalRoutes) {
        const path = route.strippedPath || "/";
        if (!compiled[path]) {
          compiled[path] = {};
        }

        const allMiddleware = [...globalMiddleware, ...route.middleware];

        compiled[path]![route.method] = async (req: Request): Promise<Response> => {
          const rawParams = (req as Request & { params?: Record<string, string> }).params ?? {};
          let coercedParams: Record<string, unknown>;
          try {
            coercedParams = coerceParams(rawParams, route.params);
          } catch (err) {
            if (err instanceof ValidationError) {
              return new Response(
                JSON.stringify({ error: "VALIDATION_ERROR", errors: [err.message] }),
                { status: 400, headers: { "Content-Type": "application/json" } },
              );
            }
            throw err;
          }

          // Fallback: Bun may not populate wildcard params for "/*" routes
          for (const param of route.params) {
            if (param.name === "*" && coercedParams["*"] === undefined) {
              const url = new URL(req.url);
              const prefix = route.strippedPath.slice(0, -1); // "/static/*" -> "/static/"
              if (url.pathname.startsWith(prefix)) {
                coercedParams["*"] = url.pathname.slice(prefix.length);
              }
              break;
            }
          }

          const schema = route.schemaConfig;
          let coercedQuery: Record<string, unknown> = {};
          let coercedBody: Record<string, unknown> = {};
          let coercedFormData: Record<string, unknown> = {};

          if (schema) {
            if (schema.query) {
              const url = new URL(req.url);
              const rawQuery: Record<string, unknown> = {};
              url.searchParams.forEach((v, k) => {
                rawQuery[k] = v;
              });
              const result = coerceAndValidate(rawQuery, schema.query);
              if (result.errors.length > 0) {
                return new Response(
                  JSON.stringify({ error: "VALIDATION_ERROR", errors: result.errors }),
                  { status: 400, headers: { "Content-Type": "application/json" } },
                );
              }
              coercedQuery = result.data;
            }

            if (schema.headers) {
              const result = coerceAndValidate(req.headers, schema.headers);
              if (result.errors.length > 0) {
                return new Response(
                  JSON.stringify({ error: "VALIDATION_ERROR", errors: result.errors }),
                  { status: 400, headers: { "Content-Type": "application/json" } },
                );
              }
            }

            if (schema.body) {
              const contentType = req.headers.get("content-type") ?? "";
              let result: { data: Record<string, unknown>; errors: string[] };
              if (contentType.includes("application/json")) {
                result = await coerceAndValidateJSONBody(req, schema.body);
              } else if (contentType.includes("application/x-www-form-urlencoded")) {
                result = await coerceAndValidateFormBody(req, schema.body);
              } else {
                return new Response(
                  JSON.stringify({ error: "VALIDATION_ERROR", errors: ["Unsupported Content-Type for body validation"] }),
                  { status: 400, headers: { "Content-Type": "application/json" } },
                );
              }
              if (result.errors.length > 0) {
                return new Response(
                  JSON.stringify({ error: "VALIDATION_ERROR", errors: result.errors }),
                  { status: 400, headers: { "Content-Type": "application/json" } },
                );
              }
              coercedBody = result.data;
            }

            if (schema.formData) {
              const result = await coerceAndValidateFormDataBody(req, schema.formData);
              if (result.errors.length > 0) {
                return new Response(
                  JSON.stringify({ error: "VALIDATION_ERROR", errors: result.errors }),
                  { status: 400, headers: { "Content-Type": "application/json" } },
                );
              }
              coercedFormData = result.data;
            }
          }

          const baseCtx = createContext(req, coercedParams);
          const ctx = {
            ...baseCtx,
            query: schema?.query ? coercedQuery : baseCtx.query,
            body: coercedBody,
            formData: coercedFormData,
          };

          const response = allMiddleware.length === 0
            ? await route.handler(ctx as Context)
            : await compose(allMiddleware)(ctx as Context, () => Promise.resolve(route.handler(ctx as Context)));

          if (schema?.responses) {
            return validateRouteResponse(response, schema.responses);
          }

          return response;
        };
      }

      return compiled as CompiledRoutes;
    },
  };

  return router;
}
