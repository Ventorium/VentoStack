// @ventostack/core - CSRF 防护中间件

import { timingSafeEqual } from "node:crypto";
import type { Context } from "../context";
import type { Middleware } from "../middleware";

/** CSRF 中间件配置选项 */
export interface CSRFOptions {
  /** 请求头名称，默认 x-csrf-token */
  tokenHeader?: string;
  /** Cookie 名称，默认 _csrf */
  cookieName?: string;
  /** 安全方法列表，默认 ["GET", "HEAD", "OPTIONS"] */
  safeMethods?: string[];
  /** Token 长度（字节），默认 32 */
  tokenLength?: number;
}

/**
 * 生成随机 Token
 * @param length - Token 字节长度
 * @returns 十六进制字符串
 */
function generateToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 恒定时间比较两个字符串，防止时序攻击
 * @param a - 字符串 a
 * @param b - 字符串 b
 * @returns 是否相等
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

/**
 * 解析 Cookie 字符串
 * @param header - Cookie 请求头值
 * @returns Cookie 键值对象
 */
function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    cookies[key] = value;
  }
  return cookies;
}

/**
 * 创建 CSRF 防护中间件
 * @param options - CSRF 配置选项
 * @returns Middleware 实例
 */
export function csrf(options: CSRFOptions = {}): Middleware {
  const tokenHeader = options.tokenHeader ?? "x-csrf-token";
  const cookieName = options.cookieName ?? "_csrf";
  const safeMethods = options.safeMethods ?? ["GET", "HEAD", "OPTIONS"];
  const tokenLength = options.tokenLength ?? 32;

  return async (ctx: Context, next) => {
    const cookies = parseCookies(ctx.headers.get("cookie"));
    const cookieToken = cookies[cookieName];

    // 安全方法：不检查 token，但确保 cookie 存在
    if (safeMethods.includes(ctx.method)) {
      const response = await next();
      if (!cookieToken) {
        return setTokenCookie(response, cookieName, generateToken(tokenLength));
      }
      return response;
    }

    // 非安全方法：必须验证 token
    if (!cookieToken) {
      return new Response(JSON.stringify({ error: "缺少 CSRF 令牌" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const headerToken = ctx.headers.get(tokenHeader);
    if (!headerToken || !constantTimeEqual(cookieToken, headerToken)) {
      return new Response(JSON.stringify({ error: "CSRF 令牌不匹配" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return next();
  };
}

/**
 * 在响应中设置 CSRF Token Cookie
 * @param response - 原始响应
 * @param cookieName - Cookie 名称
 * @param token - Token 值
 * @returns 附加 Set-Cookie 后的新响应
 */
function setTokenCookie(response: Response, cookieName: string, token: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
