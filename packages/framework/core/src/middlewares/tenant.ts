// @ventostack/core - 多租户中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

/** 租户上下文 */
export interface TenantContext {
  /** 租户标识 */
  tenantId: string;
  [key: string]: unknown;
}

/** 租户解析策略选项 */
export interface TenantResolverOptions {
  /** 解析策略 */
  strategy: "header" | "subdomain" | "path" | "custom";
  /** header 策略下的请求头名称 */
  headerName?: string;
  /** custom 策略下的自定义解析函数 */
  customResolver?: (req: Request) => string | null;
  /** 异步租户校验函数，返回 false 表示拒绝访问 */
  validateTenant?: (tenantId: string, ctx: Context) => Promise<boolean>;
}

/** 多租户中间件结果 */
export interface TenantMiddlewareResult {
  /** 中间件函数 */
  middleware: Middleware;
  /**
   * 从请求中提取租户标识
   * @param req - Request 对象
   * @returns 租户标识或 null
   */
  getTenantFromRequest(req: Request): string | null;
}

/**
 * 从请求头解析租户标识
 * @param req - Request 对象
 * @param headerName - 请求头名称
 * @returns 租户标识或 null
 */
function resolveFromHeader(req: Request, headerName: string): string | null {
  const value = req.headers.get(headerName);
  return value && value.length > 0 ? value : null;
}

/**
 * 从子域名解析租户标识
 * @param req - Request 对象
 * @returns 租户标识或 null
 */
function resolveFromSubdomain(req: Request): string | null {
  const host = req.headers.get("host");
  // 如果没有 Host header，从 URL 中提取
  const hostname = host ? host.split(":")[0]! : new URL(req.url).hostname;
  const parts = hostname.split(".");
  // 至少需要 tenant.example.com 三段
  if (parts.length < 3) return null;
  const tenant = parts[0]!;
  return tenant.length > 0 ? tenant : null;
}

/**
 * 从路径解析租户标识
 * @param req - Request 对象
 * @returns 租户标识或 null
 */
function resolveFromPath(req: Request): string | null {
  const url = new URL(req.url);
  // 从 path 第一段提取: /tenant1/api/users → tenant1
  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  return segments[0]!;
}

/**
 * 创建多租户中间件
 * @param options - 租户解析选项
 * @returns TenantMiddlewareResult
 */
export function createTenantMiddleware(options: TenantResolverOptions): TenantMiddlewareResult {
  const headerName = options.headerName ?? "x-tenant-id";

  function getTenantFromRequest(req: Request): string | null {
    switch (options.strategy) {
      case "header":
        return resolveFromHeader(req, headerName);
      case "subdomain":
        return resolveFromSubdomain(req);
      case "path":
        return resolveFromPath(req);
      case "custom": {
        if (!options.customResolver) return null;
        return options.customResolver(req);
      }
    }
  }

  const middleware: Middleware = async (ctx: Context, next) => {
    const tenantId = getTenantFromRequest(ctx.request);

    if (!tenantId) {
      return new Response(JSON.stringify({ error: "缺少租户标识" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    ctx.tenant = { tenantId } satisfies TenantContext;

    if (options.validateTenant) {
      try {
        const valid = await options.validateTenant(tenantId, ctx);
        if (!valid) {
          return new Response(JSON.stringify({ error: "无权访问该租户" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: "服务器内部错误" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const response = await next();

    // 在响应中附加 tenant header
    const newHeaders = new Headers(response.headers);
    newHeaders.set("x-tenant-id", tenantId);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };

  return { middleware, getTenantFromRequest };
}
