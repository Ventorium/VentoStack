// @aeron/core - IP 黑白名单中间件

import type { Middleware } from "../middleware";

export interface IPFilterOptions {
  /** 白名单模式 - 只允许这些 IP */
  allowlist?: string[];
  /** 黑名单模式 - 禁止这些 IP */
  denylist?: string[];
  /** 获取客户端 IP 的方式，默认从 X-Forwarded-For */
  getIP?: (req: Request) => string | null;
  /** 被拒绝时的响应状态码 */
  statusCode?: number;
}

function defaultGetIP(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP.trim();
  return null;
}

function matchIP(ip: string, pattern: string): boolean {
  // CIDR 匹配
  if (pattern.includes("/")) {
    return matchCIDR(ip, pattern);
  }
  // 通配符匹配
  if (pattern.includes("*")) {
    const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, "\\d+") + "$");
    return regex.test(ip);
  }
  return ip === pattern;
}

function matchCIDR(ip: string, cidr: string): boolean {
  const [network, bits] = cidr.split("/");
  if (!network || !bits) return false;
  const mask = Number.parseInt(bits, 10);
  if (Number.isNaN(mask) || mask < 0 || mask > 32) return false;

  const ipNum = ipToNumber(ip);
  const networkNum = ipToNumber(network);
  if (ipNum === null || networkNum === null) return false;

  const maskBits = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
  return (ipNum & maskBits) === (networkNum & maskBits);
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (Number.isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

export function ipFilter(options: IPFilterOptions = {}): Middleware {
  const {
    allowlist,
    denylist,
    getIP = defaultGetIP,
    statusCode = 403,
  } = options;

  return async (ctx, next) => {
    const ip = getIP(ctx.request);

    if (!ip) {
      // 无法获取 IP 时，allowlist 模式下拒绝
      if (allowlist && allowlist.length > 0) {
        return new Response(
          JSON.stringify({ error: "FORBIDDEN", message: "Access denied" }),
          { status: statusCode, headers: { "Content-Type": "application/json" } },
        );
      }
      return next();
    }

    // 黑名单检查
    if (denylist && denylist.length > 0) {
      for (const pattern of denylist) {
        if (matchIP(ip, pattern)) {
          return new Response(
            JSON.stringify({ error: "FORBIDDEN", message: "Access denied" }),
            { status: statusCode, headers: { "Content-Type": "application/json" } },
          );
        }
      }
    }

    // 白名单检查
    if (allowlist && allowlist.length > 0) {
      let allowed = false;
      for (const pattern of allowlist) {
        if (matchIP(ip, pattern)) {
          allowed = true;
          break;
        }
      }
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: "FORBIDDEN", message: "Access denied" }),
          { status: statusCode, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    return next();
  };
}
