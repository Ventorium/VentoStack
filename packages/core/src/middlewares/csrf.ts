// @aeron/core - CSRF 防护中间件

import { timingSafeEqual } from "node:crypto";
import type { Context } from "../context";
import type { Middleware } from "../middleware";

export interface CSRFOptions {
  tokenHeader?: string;
  cookieName?: string;
  safeMethods?: string[];
  tokenLength?: number;
}

function generateToken(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

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
      return new Response(JSON.stringify({ error: "CSRF token missing" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const headerToken = ctx.headers.get(tokenHeader);
    if (!headerToken || !constantTimeEqual(cookieToken, headerToken)) {
      return new Response(JSON.stringify({ error: "CSRF token mismatch" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return next();
  };
}

function setTokenCookie(response: Response, cookieName: string, token: string): Response {
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
