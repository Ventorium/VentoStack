// @ventostack/core - 客户端 IP 解析

/** 客户端 IP 解析选项 */
export interface ClientIPOptions {
  /**
   * 是否信任代理头。
   * 默认 false，避免直接信任客户端可伪造的 X-Forwarded-For / X-Real-IP。
   */
  trustProxyHeaders?: boolean;
}

function normalizeIP(value: string | null): string | null {
  if (!value) return null;
  const ip = value.trim();
  return ip.length > 0 ? ip : null;
}

function parseForwardedFor(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const first = headerValue.split(",")[0];
  return normalizeIP(first ?? null);
}

/**
 * 从请求解析客户端 IP。
 *
 * 优先级：
 * 1. 直接连接 IP（Bun 特有扩展 `request.conn.remoteAddress`，客户端无法伪造）——始终可用作限流键
 * 2. 代理头（X-Forwarded-For / X-Real-IP）——仅在显式信任代理头时读取，
 *    避免直接信任客户端可伪造的头导致限流被绕过
 */
export function getClientIPFromRequest(
  request: Request,
  options: ClientIPOptions = {},
): string | null {
  // 直接连接 IP（Bun Server 注入，不可伪造）
  const conn = (request as Request & { conn?: { remoteAddress?: string } }).conn;
  const directIP = conn?.remoteAddress ? normalizeIP(conn.remoteAddress) : null;

  // 仅在显式信任代理头时读取 X-Forwarded-For / X-Real-IP
  if (options.trustProxyHeaders) {
    const forwarded = parseForwardedFor(request.headers.get("x-forwarded-for"));
    if (forwarded) {
      return forwarded;
    }
    const realIP = normalizeIP(request.headers.get("x-real-ip"));
    if (realIP) {
      return realIP;
    }
  }

  return directIP;
}
