// @ventostack/core - IP 黑白名单中间件

import type { Middleware } from "../middleware";
import { getClientIPFromRequest } from "../client-ip";

/** IP 过滤配置选项 */
export interface IPFilterOptions {
  /** 白名单模式 - 只允许这些 IP */
  allowlist?: string[];
  /** 黑名单模式 - 禁止这些 IP */
  denylist?: string[];
  /**
   * 是否信任代理头。
   * 默认 false，避免直接信任客户端可伪造的 X-Forwarded-For / X-Real-IP。
   */
  trustProxyHeaders?: boolean;
  /** 获取客户端 IP 的方式，默认仅在 trustProxyHeaders=true 时读取代理头 */
  getIP?: (req: Request) => string | null;
  /** 被拒绝时的响应状态码 */
  statusCode?: number;
}

/**
 * 默认获取客户端 IP 的方法
 * @param req - Request 对象
 * @returns IP 字符串或 null
 */
function defaultGetIP(req: Request, trustProxyHeaders = false): string | null {
  return getClientIPFromRequest(req, { trustProxyHeaders });
}

/**
 * 判断 IP 是否匹配模式（支持 CIDR 与通配符）
 * @param ip - IP 地址
 * @param pattern - 匹配模式
 * @returns 是否匹配
 */
function matchIP(ip: string, pattern: string): boolean {
  // CIDR 匹配
  if (pattern.includes("/")) {
    return matchCIDR(ip, pattern);
  }
  // 通配符匹配
  if (pattern.includes("*")) {
    const regex = new RegExp(`^${pattern.replace(/\./g, "\\.").replace(/\*/g, "\\d+")}$`);
    return regex.test(ip);
  }
  return ip === pattern;
}

/**
 * CIDR 匹配
 * @param ip - IP 地址
 * @param cidr - CIDR 表示
 * @returns 是否匹配
 */
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

/**
 * 将 IPv4 字符串转为数值
 * @param ip - IP 地址
 * @returns 数值或 null
 */
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

/**
 * 创建 IP 黑白名单中间件
 * @param options - 配置选项
 * @returns Middleware 实例
 */
export function ipFilter(options: IPFilterOptions = {}): Middleware {
  const { allowlist, denylist, getIP, statusCode = 403, trustProxyHeaders = false } = options;
  const resolveIP = getIP ?? ((req: Request) => defaultGetIP(req, trustProxyHeaders));

  return async (ctx, next) => {
    const ip = resolveIP(ctx.request);

    if (!ip) {
      // 无法获取 IP 时，allowlist 模式下拒绝
      if (allowlist && allowlist.length > 0) {
        return new Response(JSON.stringify({ error: "FORBIDDEN", message: "访问被拒绝" }), {
          status: statusCode,
          headers: { "Content-Type": "application/json" },
        });
      }
      return next();
    }

    // 黑名单检查
    if (denylist && denylist.length > 0) {
      for (const pattern of denylist) {
        if (matchIP(ip, pattern)) {
          return new Response(JSON.stringify({ error: "FORBIDDEN", message: "访问被拒绝" }), {
            status: statusCode,
            headers: { "Content-Type": "application/json" },
          });
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
        return new Response(JSON.stringify({ error: "FORBIDDEN", message: "访问被拒绝" }), {
          status: statusCode,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return next();
  };
}
