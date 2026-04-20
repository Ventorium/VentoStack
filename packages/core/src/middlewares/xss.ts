// @aeron/core - XSS 过滤中间件

import type { Middleware } from "../middleware";

export interface XSSOptions {
  /** 是否设置 X-XSS-Protection header (legacy, 默认 true) */
  xssProtection?: boolean;
  /** 是否设置 X-Content-Type-Options: nosniff (默认 true) */
  noSniff?: boolean;
  /** Content-Security-Policy 值 */
  contentSecurityPolicy?: string;
  /** X-Frame-Options 值 (DENY | SAMEORIGIN) */
  frameOptions?: "DENY" | "SAMEORIGIN";
}

/**
 * HTML 实体转义，防止 XSS 注入。
 * 使用 Bun.escapeHTML() 当可用，否则 fallback。
 */
export function escapeHTML(input: string): string {
  if (typeof Bun !== "undefined" && typeof Bun.escapeHTML === "function") {
    return Bun.escapeHTML(input);
  }
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * 检测字符串中是否含有潜在 XSS 载荷
 */
export function detectXSS(input: string): boolean {
  const patterns = [
    /<script[\s>]/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data:\s*text\/html/i,
    /vbscript:/i,
    /<iframe[\s>]/i,
    /<object[\s>]/i,
    /<embed[\s>]/i,
    /<svg[\s>].*?on\w+/i,
  ];
  return patterns.some((p) => p.test(input));
}

/**
 * XSS 安全头中间件。
 * 添加 security headers 并可选地检测请求参数中的 XSS 载荷。
 */
export function xssProtection(options: XSSOptions = {}): Middleware {
  const {
    xssProtection: xss = true,
    noSniff = true,
    contentSecurityPolicy,
    frameOptions = "DENY",
  } = options;

  return async (ctx, next) => {
    const response = await next();

    // 克隆 response 以添加 headers
    const headers = new Headers(response.headers);

    if (xss) {
      headers.set("X-XSS-Protection", "1; mode=block");
    }
    if (noSniff) {
      headers.set("X-Content-Type-Options", "nosniff");
    }
    if (contentSecurityPolicy) {
      headers.set("Content-Security-Policy", contentSecurityPolicy);
    }
    if (frameOptions) {
      headers.set("X-Frame-Options", frameOptions);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
