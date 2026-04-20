// @aeron/core - 多租户中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

export interface TenantContext {
  tenantId: string;
  [key: string]: unknown;
}

export interface TenantResolverOptions {
  strategy: "header" | "subdomain" | "path" | "custom";
  headerName?: string;
  customResolver?: (req: Request) => string | null;
}

export interface TenantMiddlewareResult {
  middleware: Middleware;
  getTenantFromRequest(req: Request): string | null;
}

function resolveFromHeader(req: Request, headerName: string): string | null {
  const value = req.headers.get(headerName);
  return value && value.length > 0 ? value : null;
}

function resolveFromSubdomain(req: Request): string | null {
  const host = req.headers.get("host");
  // 如果没有 Host header，从 URL 中提取
  const hostname = host
    ? host.split(":")[0]!
    : new URL(req.url).hostname;
  const parts = hostname.split(".");
  // 至少需要 tenant.example.com 三段
  if (parts.length < 3) return null;
  const tenant = parts[0]!;
  return tenant.length > 0 ? tenant : null;
}

function resolveFromPath(req: Request): string | null {
  const url = new URL(req.url);
  // 从 path 第一段提取: /tenant1/api/users → tenant1
  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  return segments[0]!;
}

export function createTenantMiddleware(
  options: TenantResolverOptions,
): TenantMiddlewareResult {
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
      return new Response(
        JSON.stringify({ error: "Missing tenant identifier" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    ctx.tenant = { tenantId } satisfies TenantContext;

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
