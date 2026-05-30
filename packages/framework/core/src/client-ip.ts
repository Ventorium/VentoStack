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
 * 从请求头解析客户端 IP。
 * 仅在显式信任代理头时读取 X-Forwarded-For / X-Real-IP。
 */
export function getClientIPFromRequest(
  request: Request,
  options: ClientIPOptions = {},
): string | null {
  if (!options.trustProxyHeaders) {
    return null;
  }

  const forwarded = parseForwardedFor(request.headers.get("x-forwarded-for"));
  if (forwarded) {
    return forwarded;
  }

  return normalizeIP(request.headers.get("x-real-ip"));
}
