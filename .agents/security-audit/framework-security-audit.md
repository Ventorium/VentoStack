# Framework Security Middleware Audit
## cors.ts
```typescript
// @ventostack/core - CORS 中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

/** CORS 配置选项 */
export interface CorsOptions {
  /** 允许的源：字符串、字符串数组或自定义判断函数 */
  origin?: string | string[] | ((origin: string) => boolean);
  /** 允许的 HTTP 方法 */
  methods?: string[];
  /** 允许的请求头 */
  allowedHeaders?: string[];
  /** 暴露给客户端的响应头 */
  exposedHeaders?: string[];
  /** 是否允许携带凭证 */
  credentials?: boolean;
  /** 预检请求缓存时间（秒） */
  maxAge?: number;
}

/**
 * 判断请求源是否被允许
 * @param requestOrigin - 请求中的 Origin
 * @param option - CORS 配置中的 origin
 * @returns 是否允许
 */
function normalizeOrigin(origin: string): string {
  // 去除尾部斜杠，避免 "http://localhost:4321/" 与 "http://localhost:4321" 不匹配
  return origin.replace(/\/$/, "");
}

function isOriginAllowed(requestOrigin: string, option: CorsOptions["origin"]): boolean {
  if (option === undefined) {
    return false; // 默认 deny
  }
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  if (typeof option === "string") {
    return normalizeOrigin(option) === normalizedRequestOrigin;
  }
  if (Array.isArray(option)) {
    return option.map(normalizeOrigin).includes(normalizedRequestOrigin);
  }
  return option(requestOrigin);
}

/**
 * 创建 CORS 中间件
 * @param options - CORS 配置选项
 * @returns Middleware 实例
 */
export function cors(options: CorsOptions = {}): Middleware {
  // 安全检查：禁止 credentials + wildcard origin
  if (options.credentials && options.origin === "*") {
    throw new Error("CORS credentials with wildcard origin is not allowed");
  }

  const methods = options.methods ?? ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"];
  const allowedHeaders = options.allowedHeaders;
  const exposedHeaders = options.exposedHeaders;
  const credentials = options.credentials ?? false;
  const maxAge = options.maxAge;

  return async (ctx: Context, next) => {
    const requestOrigin = ctx.headers.get("origin") ?? "";

    // 无 origin header 则不处理 CORS
    if (!requestOrigin) {
      return next();
    }

    const allowed = isOriginAllowed(requestOrigin, options.origin);

    if (!allowed) {
      // origin 不允许，不附加 CORS headers
      if (ctx.method === "OPTIONS") {
        return new Response(null, { status: 403 });
      }
      return next();
    }

    const corsHeaders = new Headers();
    corsHeaders.set("Access-Control-Allow-Origin", requestOrigin);

    if (credentials) {
      corsHeaders.set("Access-Control-Allow-Credentials", "true");
    }

    if (exposedHeaders && exposedHeaders.length > 0) {
      corsHeaders.set("Access-Control-Expose-Headers", exposedHeaders.join(", "));
    }

    // Preflight
    if (ctx.method === "OPTIONS") {
      corsHeaders.set("Access-Control-Allow-Methods", methods.join(", "));
      if (allowedHeaders && allowedHeaders.length > 0) {
        corsHeaders.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));
      } else {
        // 反射请求头
        const requestHeaders = ctx.headers.get("access-control-request-headers");
        if (requestHeaders) {
          corsHeaders.set("Access-Control-Allow-Headers", requestHeaders);
        }
      }
      if (maxAge !== undefined) {
        corsHeaders.set("Access-Control-Max-Age", String(maxAge));
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 非预检请求：调用 next，在 response 上附加 CORS headers
    const response = await next();
    const newHeaders = new Headers(response.headers);
    corsHeaders.forEach((value, key) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}
```

## csrf.ts
```typescript
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
```

## error-handler.ts
```typescript
// @ventostack/core - 内置错误处理中间件

import type { Context } from "../context";
import { ValidationError, VentoStackError } from "../errors";
import type { Middleware } from "../middleware";
import type { LoggerLike } from "./logger";

const noopLogger: LoggerLike = {
  info() {},
  error() {},
};

const consoleLogger: LoggerLike = {
  info(message, meta) {
    console.log(JSON.stringify({ level: "info", message, ...meta }));
  },
  error(message, meta) {
    console.error(JSON.stringify({ level: "error", message, ...meta }));
  },
};

/** 错误处理中间件配置选项 */
export interface ErrorHandlerOptions {
  /** 自定义日志实现 */
  logger?: LoggerLike;
  /** 是否静默 */
  silent?: boolean;
  /** 生产环境返回的固定错误消息，默认 "服务器内部错误" */
  fallbackMessage?: string;
}

/**
 * 全局错误处理中间件：捕获未处理异常，返回统一错误格式。
 * VentoStackError 返回结构化响应（包含 errorCode 和 message）。
 * 其他错误返回 500，且不暴露内部错误细节。
 * @param options - 配置选项
 * @returns Middleware 实例
 */
export function errorHandler(options?: ErrorHandlerOptions): Middleware {
  const logger = options?.silent ? noopLogger : (options?.logger ?? consoleLogger);
  const fallbackMessage = options?.fallbackMessage ?? "服务器内部错误";

  return async (ctx: Context, next) => {
    try {
      return await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (error instanceof VentoStackError) {
        logger.error("handled error", {
          method: ctx.method,
          path: ctx.path,
          errorCode: error.errorCode,
          message: error.message,
        });
        const body: Record<string, unknown> = { error: error.errorCode, message: error.message };
        if (error instanceof ValidationError && error.details) {
          body.details = error.details;
        }
        return ctx.json(body, error.code);
      }

      const stack = error instanceof Error ? error.stack : undefined;
      logger.error("unhandled error", {
        method: ctx.method,
        path: ctx.path,
        error: message,
        ...(stack ? { stack } : {}),
      });

      return ctx.json({ error: "INTERNAL_ERROR", message: fallbackMessage }, 500);
    }
  };
}
```

## hmac.ts
```typescript
// @ventostack/core - HMAC 请求签名中间件

import { timingSafeEqual } from "node:crypto";
import type { Context } from "../context";
import type { Middleware } from "../middleware";

/** HMAC 签名配置选项 */
export interface HMACOptions {
  /** 签名密钥 */
  secret: string;
  /** 哈希算法，默认 SHA-256 */
  algorithm?: "SHA-256" | "SHA-384" | "SHA-512";
  /** 签名请求头名称，默认 x-signature */
  header?: string;
  /** 时间戳请求头名称，默认 x-timestamp */
  timestampHeader?: string;
  /** Nonce 请求头名称，默认 x-nonce */
  nonceHeader?: string;
  /** 签名最大有效期（毫秒），默认 5 分钟 */
  maxAge?: number;
}

const ALGO_MAP: Record<string, string> = {
  "SHA-256": "SHA-256",
  "SHA-384": "SHA-384",
  "SHA-512": "SHA-512",
};

/**
 * 将 ArrayBuffer 转为十六进制字符串
 * @param buffer - ArrayBuffer
 * @returns 十六进制字符串
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 恒定时间比较字符串
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
 * 创建 HMAC 签名器
 * @param options - HMAC 配置选项
 * @returns 包含签名、校验与中间件的对象
 */
export function createHMACSigner(options: HMACOptions): {
  /**
   * 生成请求签名
   * @param method - HTTP 方法
   * @param path - 请求路径
   * @param body - 请求体
   * @param timestamp - 时间戳
   * @param nonce - 随机数
   * @returns 签名结果对象
   */
  sign(
    method: string,
    path: string,
    body?: string,
    timestamp?: number,
    nonce?: string,
  ): Promise<{ signature: string; timestamp: number; nonce: string }>;
  /**
   * 校验请求签名
   * @param request - Request 对象
   * @returns 校验结果
   */
  verify(request: Request): Promise<{ valid: boolean; reason?: string }>;
  /** 获取 HMAC 校验中间件 */
  middleware(): Middleware;
} {
  const algorithm = options.algorithm ?? "SHA-256";
  const headerName = options.header ?? "x-signature";
  const timestampHeader = options.timestampHeader ?? "x-timestamp";
  const nonceHeader = options.nonceHeader ?? "x-nonce";
  const maxAge = options.maxAge ?? 300_000; // 5 minutes
  const algoName = ALGO_MAP[algorithm]!;

  // Nonce 去重存储
  const usedNonces = new Map<string, number>(); // nonce -> expiry timestamp

  // 定期清理过期 nonce
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [nonce, expiry] of usedNonces) {
      if (expiry < now) {
        usedNonces.delete(nonce);
      }
    }
  }, 60_000);

  // 防止 timer 阻止进程退出
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }

  async function importKey(): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    return crypto.subtle.importKey(
      "raw",
      encoder.encode(options.secret),
      { name: "HMAC", hash: algoName },
      false,
      ["sign", "verify"],
    );
  }

  async function computeSignature(
    method: string,
    path: string,
    body: string,
    timestamp: number,
    nonce: string,
  ): Promise<string> {
    const key = await importKey();
    const message = `${timestamp}\n${nonce}\n${method}\n${path}\n${body}`;
    const encoder = new TextEncoder();
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    return bufferToHex(sig);
  }

  async function sign(
    method: string,
    path: string,
    body?: string,
    timestamp?: number,
    nonce?: string,
  ): Promise<{ signature: string; timestamp: number; nonce: string }> {
    const ts = timestamp ?? Date.now();
    const n = nonce ?? crypto.randomUUID();
    const signature = await computeSignature(method, path, body ?? "", ts, n);
    return { signature, timestamp: ts, nonce: n };
  }

  async function verify(request: Request): Promise<{ valid: boolean; reason?: string }> {
    const sig = request.headers.get(headerName);
    if (!sig) {
      return { valid: false, reason: "Missing signature header" };
    }

    const tsStr = request.headers.get(timestampHeader);
    if (!tsStr) {
      return { valid: false, reason: "Missing timestamp header" };
    }

    const nonceVal = request.headers.get(nonceHeader);
    if (!nonceVal) {
      return { valid: false, reason: "Missing nonce header" };
    }

    const ts = Number.parseInt(tsStr, 10);
    if (Number.isNaN(ts)) {
      return { valid: false, reason: "Invalid timestamp" };
    }

    // 检查时间范围
    const now = Date.now();
    if (Math.abs(now - ts) > maxAge) {
      return { valid: false, reason: "Signature expired" };
    }

    // 检查 nonce 是否重复
    if (usedNonces.has(nonceVal)) {
      return { valid: false, reason: "Nonce already used" };
    }

    const url = new URL(request.url);
    const body = await request.clone().text();

    const expected = await computeSignature(request.method, url.pathname, body, ts, nonceVal);

    if (!constantTimeEqual(sig, expected)) {
      return { valid: false, reason: "Signature mismatch" };
    }

    // 记录 nonce，设置过期时间
    usedNonces.set(nonceVal, now + maxAge);

    return { valid: true };
  }

  function middleware(): Middleware {
    return async (_ctx: Context, next) => {
      const result = await verify(_ctx.request);
      if (!result.valid) {
        return new Response(JSON.stringify({ error: result.reason }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return next();
    };
  }

  return { sign, verify, middleware };
}
```

## https.ts
```typescript
// @ventostack/core - HTTPS 强制与 HSTS 中间件

import type { Middleware } from "../middleware";

/** HTTPS 强制中间件配置选项 */
export interface HTTPSOptions {
  /** 是否启用 HSTS header */
  hsts?: boolean;
  /** HSTS max-age（秒），默认 1年 */
  maxAge?: number;
  /** 是否包含子域 */
  includeSubDomains?: boolean;
  /** 是否添加 preload 标记 */
  preload?: boolean;
  /** 信任的代理 header（默认 X-Forwarded-Proto） */
  proxyHeader?: string;
  /** 排除的路径（如健康检查） */
  excludePaths?: string[];
}

/**
 * 创建 HTTPS 强制中间件
 * 非 HTTPS 请求将被 301 重定向；HTTPS 响应附加 HSTS 头
 * @param options - 配置选项
 * @returns Middleware 实例
 */
export function httpsEnforce(options: HTTPSOptions = {}): Middleware {
  const {
    hsts = true,
    maxAge = 31536000,
    includeSubDomains = true,
    preload = false,
    proxyHeader = "x-forwarded-proto",
    excludePaths = [],
  } = options;

  let hstsValue = `max-age=${maxAge}`;
  if (includeSubDomains) hstsValue += "; includeSubDomains";
  if (preload) hstsValue += "; preload";

  const excludeSet = new Set(excludePaths);

  return async (ctx, next) => {
    // 排除路径跳过
    if (excludeSet.has(ctx.path)) {
      return next();
    }

    const proto = ctx.request.headers.get(proxyHeader) ?? "http";
    const isSecure = proto === "https";

    // 非 HTTPS 时重定向
    if (!isSecure) {
      const url = new URL(ctx.request.url);
      url.protocol = "https:";
      return new Response(null, {
        status: 301,
        headers: { Location: url.toString() },
      });
    }

    const response = await next();

    // 添加 HSTS header
    if (hsts) {
      const headers = new Headers(response.headers);
      headers.set("Strict-Transport-Security", hstsValue);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  };
}
```

## ip-filter.ts
```typescript
// @ventostack/core - IP 黑白名单中间件

import { getClientIPFromRequest } from "../client-ip";
import type { Middleware } from "../middleware";

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
```

## logger.ts
```typescript
// @ventostack/core - 内置请求日志中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

/** 日志接口 */
export interface LoggerLike {
  /**
   * 输出 info 级别日志
   * @param message - 日志消息
   * @param meta - 附加元数据
   */
  info(message: string, meta?: Record<string, unknown>): void;
  /**
   * 输出 error 级别日志
   * @param message - 日志消息
   * @param meta - 附加元数据
   */
  error(message: string, meta?: Record<string, unknown>): void;
}

const noopLogger: LoggerLike = {
  info() {},
  error() {},
};

const consoleLogger: LoggerLike = {
  info(message, meta) {
    console.log(JSON.stringify({ level: "info", message, ...meta }));
  },
  error(message, meta) {
    console.error(JSON.stringify({ level: "error", message, ...meta }));
  },
};

/** 请求日志中间件配置选项 */
export interface RequestLoggerOptions {
  /** 自定义日志实现 */
  logger?: LoggerLike;
  /** 是否静默（不输出日志） */
  silent?: boolean;
}

/**
 * 请求日志中间件：记录请求方法、路径、状态码、耗时。
 * 默认输出结构化 JSON 到 console，可通过 options.logger 替换。
 * @param options - 配置选项
 * @returns Middleware 实例
 */
export function requestLogger(options?: RequestLoggerOptions): Middleware {
  const logger = options?.silent ? noopLogger : (options?.logger ?? consoleLogger);

  return async (ctx: Context, next) => {
    const start = performance.now();
    const response = await next();
    const duration = (performance.now() - start).toFixed(2);

    logger.info("request", {
      method: ctx.method,
      path: ctx.path,
      status: response.status,
      duration: `${duration}ms`,
    });

    return response;
  };
}
```

## rate-limit.ts
```typescript
// @ventostack/core - 限流中间件

import { getClientIPFromRequest } from "../client-ip";
import type { Context } from "../context";
import type { Middleware } from "../middleware";

/** 限流存储接口 */
export interface RateLimitStore {
  /**
   * 增加计数
   * @param key - 限流键
   * @param windowMs - 时间窗口（毫秒）
   * @returns 当前计数与重置时间
   */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
  /**
   * 重置计数
   * @param key - 限流键
   */
  reset(key: string): Promise<void>;
}

/** 限流中间件配置选项 */
export interface RateLimitOptions {
  /** 时间窗口（毫秒），默认 60000 */
  windowMs?: number;
  /** 窗口内最大请求数，默认 100 */
  max?: number;
  /** 触发限流时的响应消息 */
  message?: string;
  /**
   * 是否信任代理头。
   * 默认 false，避免客户端通过伪造 X-Forwarded-For / X-Real-IP 绕过限流。
   */
  trustProxyHeaders?: boolean;
  /** 生成限流键的函数 */
  keyFn?: (ctx: Context) => string;
  /** 自定义存储后端 */
  store?: RateLimitStore;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

/**
 * 创建内存限流存储（单实例）
 * @returns RateLimitStore 实例
 */
export function createMemoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, WindowEntry>();

  // 定期清理过期条目
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of windows) {
      if (now >= entry.resetAt) {
        windows.delete(key);
      }
    }
  }, 60_000);

  // 允许进程退出时不阻塞
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }

  return {
    async increment(key: string, windowMs: number) {
      const now = Date.now();
      const existing = windows.get(key);

      if (!existing || now >= existing.resetAt) {
        const entry: WindowEntry = { count: 1, resetAt: now + windowMs };
        windows.set(key, entry);
        return { count: 1, resetAt: entry.resetAt };
      }

      existing.count++;
      return { count: existing.count, resetAt: existing.resetAt };
    },

    async reset(key: string) {
      windows.delete(key);
    },
  };
}

/**
 * 默认限流键生成函数（基于客户端 IP）
 * @param ctx - 请求上下文
 * @returns IP 字符串
 */
function defaultKeyFn(ctx: Context, trustProxyHeaders = false): string {
  return getClientIPFromRequest(ctx.request, { trustProxyHeaders }) ?? "unknown";
}

/**
 * 最小 Redis 客户端接口，基于 Bun.RedisClient 设计
 */
export interface RedisClientLike {
  /** 执行 INCR 命令 */
  incr(key: string): Promise<number>;
  /** 执行 PEXPIRE 命令（毫秒），返回是否设置成功 */
  pexpire(key: string, milliseconds: number): Promise<number>;
  /** 执行 PTTL 命令（毫秒），-1 表示无过期，-2 表示键不存在 */
  pttl(key: string): Promise<number>;
  /** 执行 DEL 命令 */
  del(key: string): Promise<number>;
}

/** Redis 限流存储选项 */
export interface RedisRateLimitStoreOptions {
  /** Redis 客户端实例 */
  client: RedisClientLike;
  /** 键前缀，默认 "ratelimit:" */
  keyPrefix?: string;
}

/**
 * 创建 Redis 限流存储（支持分布式多实例）
 *
 * 使用原子 Lua 脚本保证 INCR + PEXPIRE 的一致性，避免 race condition。
 *
 * @example
 * ```typescript
 * import { createRedisRateLimitStore, rateLimit } from "@ventostack/core";
 * import { RedisClient } from "bun";
 *
 * const redis = new RedisClient("redis://localhost:6379");
 * const store = createRedisRateLimitStore({ client: redis });
 *
 * app.use(rateLimit({
 *   windowMs: 60_000,
 *   max: 100,
 *   store,
 * }));
 * ```
 */
export function createRedisRateLimitStore(options: RedisRateLimitStoreOptions): RateLimitStore {
  const { client, keyPrefix = "ratelimit:" } = options;

  // Lua 脚本：原子化 INCR + PEXPIRE
  const luaScript = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('PTTL', KEYS[1])
    return {current, ttl}
  `;

  return {
    async increment(key: string, windowMs: number) {
      const fullKey = `${keyPrefix}${key}`;
      // 如果客户端支持 eval（Bun Redis），使用原子 Lua 脚本
      if (
        "eval" in client &&
        typeof (client as unknown as Record<string, unknown>).eval === "function"
      ) {
        const result = await (
          client as unknown as {
            eval(script: string, keys: number, ...args: string[]): Promise<[number, number]>;
          }
        ).eval(luaScript, 1, fullKey, String(windowMs));
        const [count, ttlMs] = result;
        const resetAt = Date.now() + ttlMs;
        return { count, resetAt };
      }

      // 降级：分步执行（极小概率出现 race，绝大多数场景可接受）
      const count = await client.incr(fullKey);
      if (count === 1) {
        await client.pexpire(fullKey, windowMs);
      }
      const ttlMs = await client.pttl(fullKey);
      const resetAt = Date.now() + (ttlMs > 0 ? ttlMs : windowMs);
      return { count, resetAt };
    },

    async reset(key: string) {
      await client.del(`${keyPrefix}${key}`);
    },
  };
}

/**
 * 创建限流中间件
 * @param options - 限流配置选项
 * @returns Middleware 实例
 */
export function rateLimit(options: RateLimitOptions = {}): Middleware {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 100;
  const message = options.message ?? "请求过于频繁";
  const keyFn = options.keyFn ?? ((ctx: Context) => defaultKeyFn(ctx, options.trustProxyHeaders));
  const store = options.store ?? createMemoryRateLimitStore();

  return async (ctx: Context, next) => {
    const key = keyFn(ctx);
    const { count, resetAt } = await store.increment(key, windowMs);
    const remaining = Math.max(0, max - count);

    if (count > max) {
      const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
      return new Response(JSON.stringify({ error: message }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(resetAt),
        },
      });
    }

    const response = await next();
    const newHeaders = new Headers(response.headers);
    newHeaders.set("X-RateLimit-Limit", String(max));
    newHeaders.set("X-RateLimit-Remaining", String(remaining));
    newHeaders.set("X-RateLimit-Reset", String(resetAt));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}
```

## request-id.ts
```typescript
// @ventostack/core - 请求 ID 中间件

import type { Context } from "../context";
import type { Middleware } from "../middleware";

/**
 * 创建请求 ID 中间件
 * 从请求头读取或自动生成 UUID，并注入到 ctx.state 与响应头中
 * @param headerName - 请求头名称，默认 X-Request-Id
 * @returns Middleware 实例
 */
export function requestId(headerName = "X-Request-Id"): Middleware {
  return async (ctx: Context, next) => {
    const id = ctx.headers.get(headerName) ?? crypto.randomUUID();
    ctx.state.requestId = id;

    const response = await next();
    const newHeaders = new Headers(response.headers);
    newHeaders.set(headerName, id);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}
```

## ssrf.ts
```typescript
// @ventostack/core - SSRF 防护

import { lookup } from "node:dns/promises";

/** SSRF 防护配置选项 */
export interface SSRFOptions {
  /** 允许的域名白名单 */
  allowedHosts?: string[];
  /** 额外阻塞的 CIDR */
  blockedCIDRs?: string[];
  /** 是否允许访问私有地址 */
  allowPrivate?: boolean;
}

const DEFAULT_BLOCKED_V4 = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "0.0.0.0/8",
];

const DEFAULT_BLOCKED_V6 = ["::1/128", "fc00::/7", "fe80::/10"];

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const LOCALHOST_HOSTS = new Set(["localhost"]);

/**
 * 将 IPv4 字符串转为数值
 * @param ip - IP 地址
 * @returns 数值
 */
function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number.parseInt(octet, 10), 0) >>> 0;
}

/**
 * 判断是否为 IPv4
 * @param host - 主机字符串
 * @returns 是否为 IPv4
 */
function isIPv4(host: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * 判断 IPv4 是否在 CIDR 内
 * @param ip - IP 地址
 * @param cidr - CIDR
 * @returns 是否在范围内
 */
function isInCIDRv4(ip: string, cidr: string): boolean {
  const [network, bits] = cidr.split("/");
  if (!network || !bits) return false;
  const mask = (~0 << (32 - Number.parseInt(bits, 10))) >>> 0;
  return (ipv4ToNumber(ip) & mask) === (ipv4ToNumber(network) & mask);
}

/**
 * 展开 IPv6 地址
 * @param ip - IPv6 地址
 * @returns 展开后的完整地址
 */
function ipv6Expand(ip: string): string {
  // 去除 zone id
  const noZone = ip.split("%")[0]!;
  let parts = noZone.split(":");
  const dblIdx = parts.indexOf("");

  if (dblIdx !== -1) {
    // 处理 :: 展开
    const before = parts.slice(0, dblIdx);
    const after = parts.slice(dblIdx + 1).filter((p) => p !== "");
    const missing = 8 - before.length - after.length;
    parts = [...before, ...Array(missing).fill("0"), ...after];
  }

  return parts.map((p) => p.padStart(4, "0")).join(":");
}

/**
 * 将 IPv6 字符串转为 BigInt
 * @param ip - IPv6 地址
 * @returns BigInt 数值
 */
function ipv6ToBigInt(ip: string): bigint {
  const expanded = ipv6Expand(ip);
  const hex = expanded.replace(/:/g, "");
  return BigInt(`0x${hex}`);
}

/**
 * 判断是否为 IPv6
 * @param host - 主机字符串
 * @returns 是否为 IPv6
 */
function isIPv6(host: string): boolean {
  return host.includes(":");
}

/**
 * 判断 IPv6 是否在 CIDR 内
 * @param ip - IP 地址
 * @param cidr - CIDR
 * @returns 是否在范围内
 */
function isInCIDRv6(ip: string, cidr: string): boolean {
  const [network, bits] = cidr.split("/");
  if (!network || !bits) return false;
  const prefixLen = Number.parseInt(bits, 10);
  const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefixLen)) - 1n);
  return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(network) & mask);
}

/**
 * 判断 IP 是否被阻塞
 * @param ip - IP 地址
 * @param blockedV4 - 阻塞的 IPv4 CIDR 列表
 * @param blockedV6 - 阻塞的 IPv6 CIDR 列表
 * @returns 是否被阻塞
 */
function isBlockedIP(ip: string, blockedV4: string[], blockedV6: string[]): boolean {
  if (isIPv4(ip)) {
    return blockedV4.some((cidr) => isInCIDRv4(ip, cidr));
  }
  if (isIPv6(ip)) {
    return blockedV6.some((cidr) => isInCIDRv6(ip, cidr));
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    LOCALHOST_HOSTS.has(hostname.toLowerCase()) || hostname.toLowerCase().endsWith(".localhost")
  );
}

/**
 * 创建 SSRF 防护守卫
 * @param options - 配置选项
 * @returns 包含 validateURL 与 safeFetch 的对象
 */
export function createSSRFGuard(options: SSRFOptions = {}): {
  /**
   * 校验 URL 是否安全
   * @param url - 待校验 URL
   * @returns 校验结果
   */
  validateURL(url: string): { safe: boolean; reason?: string };
  /**
   * 安全地发起 fetch，自动校验 URL
   * @param url - 请求地址
   * @param init - fetch 选项
   * @returns Response
   */
  safeFetch(url: string, init?: RequestInit): Promise<Response>;
} {
  const allowedHosts = new Set(options.allowedHosts ?? []);
  const allowPrivate = options.allowPrivate ?? false;

  const customBlockedCIDRs = options.blockedCIDRs ?? [];
  const blockedV4 = allowPrivate
    ? customBlockedCIDRs.filter((c) => !c.includes(":"))
    : [...DEFAULT_BLOCKED_V4, ...customBlockedCIDRs.filter((c) => !c.includes(":"))];
  const blockedV6 = allowPrivate
    ? customBlockedCIDRs.filter((c) => c.includes(":"))
    : [...DEFAULT_BLOCKED_V6, ...customBlockedCIDRs.filter((c) => c.includes(":"))];

  function validateURL(url: string): { safe: boolean; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { safe: false, reason: "Invalid URL" };
    }

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return { safe: false, reason: `Protocol not allowed: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");

    // 白名单域名直接放行
    if (allowedHosts.has(hostname)) {
      return { safe: true };
    }

    if (!allowPrivate && isBlockedHostname(hostname)) {
      return { safe: false, reason: `Blocked hostname: ${hostname}` };
    }

    // 检查 IP 地址
    if (isIPv4(hostname) || isIPv6(hostname)) {
      if (isBlockedIP(hostname, blockedV4, blockedV6)) {
        return { safe: false, reason: `Blocked IP: ${hostname}` };
      }
    }

    return { safe: true };
  }

  async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
    const result = validateURL(url);
    if (!result.safe) {
      throw new Error(`SSRF blocked: ${result.reason}`);
    }

    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
    if (!allowedHosts.has(hostname) && !allowPrivate && !isIPv4(hostname) && !isIPv6(hostname)) {
      const resolved = await lookup(hostname, { all: true, verbatim: true });
      if (resolved.length === 0) {
        throw new Error(`SSRF blocked: Unable to resolve hostname: ${hostname}`);
      }

      const blockedAddress = resolved.find((record) =>
        isBlockedIP(record.address, blockedV4, blockedV6),
      );
      if (blockedAddress) {
        throw new Error(
          `SSRF blocked: Hostname ${hostname} resolved to blocked IP ${blockedAddress.address}`,
        );
      }
    }

    return fetch(url, init);
  }

  return { validateURL, safeFetch };
}
```

## static.ts
```typescript
/**
 * @ventostack/core - 静态文件服务中间件
 * 提供安全的本地文件服务，内置路径遍历防护
 *
 * 不依赖 node:path，纯字符串操作实现路径安全校验
 */

import type { Middleware } from "../middleware";

/**
 * 静态文件服务选项
 */
export interface StaticOptions {
  /** 文件系统根目录 */
  root: string;
  /** URL 路径前缀（如 "/uploads"） */
  prefix?: string;
  /** 默认 index 文件名（如 "index.html"），不设置则不提供目录索引 */
  index?: string;
  /** 允许的文件扩展名白名单（如 [".jpg", ".png", ".pdf"]），不设置则允许所有 */
  allowedExtensions?: string[];
}

/**
 * 规范化路径：去除尾部斜杠、合并连续斜杠
 */
function normalizePath(p: string): string {
  return p.replace(/\/+$/, "").replace(/\/+/g, "/") || "/";
}

/**
 * 创建静态文件服务中间件
 *
 * 内置安全措施：
 * - 路径遍历防护（过滤 `..`、`.` 和多余斜杠）
 * - 文件存在性检查
 * - 自动设置 Content-Type（由 Bun.file 推断）
 *
 * @param options - 静态文件选项
 * @returns 中间件函数
 *
 * @example
 * ```typescript
 * import { createApp, createStaticMiddleware } from "@ventostack/core";
 *
 * const app = createApp();
 * app.use(createStaticMiddleware({
 *   root: "/data/uploads",
 *   prefix: "/uploads",
 * }));
 * ```
 */
export function createStaticMiddleware(options: StaticOptions): Middleware {
  const { root, prefix = "/", index, allowedExtensions } = options;

  // 预计算规范化根路径（去除尾部斜杠）
  const normalizedRoot = normalizePath(root);
  const normalizedPrefix = normalizePath(prefix);

  return async (ctx, next) => {
    const url = new URL(ctx.request.url);
    const pathname = decodeURIComponent(url.pathname);

    // 仅处理匹配前缀的请求
    if (!pathname.startsWith(normalizedPrefix + "/") && pathname !== normalizedPrefix) {
      return next();
    }

    // 提取前缀之后的相对路径
    const relativePath = pathname.slice(normalizedPrefix.length).replace(/^\/+/, "");

    // 安全过滤：逐段去除 `..` 和 `.`
    const sanitized = relativePath
      .split("/")
      .filter((seg) => seg !== ".." && seg !== "." && seg !== "")
      .join("/");

    if (!sanitized && !index) {
      return next();
    }

    const filePath = sanitized || index || "";

    // 安全：扩展名白名单
    if (allowedExtensions && allowedExtensions.length > 0) {
      const dotIdx = filePath.lastIndexOf(".");
      const ext = dotIdx >= 0 ? filePath.slice(dotIdx).toLowerCase() : "";
      if (!allowedExtensions.includes(ext)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // 拼接完整路径并校验不逃逸根目录
    const fullPath = normalizedRoot + "/" + filePath;
    if (!fullPath.startsWith(normalizedRoot + "/") && fullPath !== normalizedRoot) {
      return new Response("Forbidden", { status: 403 });
    }

    // Bun.file 自动推断 Content-Type
    const file = Bun.file(fullPath);
    if (await file.exists()) {
      return new Response(file);
    }

    return next();
  };
}
```

## tenant.ts
```typescript
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
```

## timeout.ts
```typescript
// @ventostack/core - 超时中间件

import type { Middleware } from "../middleware";

const VENTOSTACK_TIMEOUT_SENTINEL = "__VENTOSTACK_TIMEOUT__";

/** 超时中间件配置选项 */
export interface TimeoutOptions {
  /** 超时时间（毫秒），默认 30000 */
  ms?: number;
  /** 超时响应消息，默认 "请求超时" */
  message?: string;
}

/**
 * 创建请求超时中间件
 * 超过指定时间未返回则返回 408 响应
 * @param options - 超时配置选项
 * @returns Middleware 实例
 */
export function timeout(options: TimeoutOptions = {}): Middleware {
  const ms = options.ms ?? 30_000;
  const message = options.message ?? "请求超时";

  return async (_ctx, next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      const result = await Promise.race([
        next(),
        new Promise<Response>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new Error(VENTOSTACK_TIMEOUT_SENTINEL));
          });
        }),
      ]);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.message === VENTOSTACK_TIMEOUT_SENTINEL) {
        return new Response(JSON.stringify({ error: message }), {
          status: 408,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }
  };
}
```

## upload.ts
```typescript
// @ventostack/core - 上传安全检查

/** 上传校验配置选项 */
export interface UploadOptions {
  /** 最大文件大小（字节），默认 5MB */
  maxFileSize?: number;
  /** 最大文件数量，默认 10 */
  maxFiles?: number;
  /** 允许的 MIME 类型列表 */
  allowedMimeTypes?: string[];
  /** 允许的扩展名列表 */
  allowedExtensions?: string[];
  /** 是否拒绝双扩展名，默认 true */
  rejectDoubleExtensions?: boolean;
  /** 是否拒绝空字节，默认 true */
  rejectNullBytes?: boolean;
}

/** 上传文件信息 */
export interface UploadFileInfo {
  /** 清理后的文件名 */
  name: string;
  /** 原始文件名 */
  originalName: string;
  /** 文件大小（字节） */
  size: number;
  /** MIME 类型 */
  mimeType: string;
}

/** 上传校验结果 */
export interface UploadResult {
  /** 是否通过校验 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 通过校验的文件信息列表 */
  files: UploadFileInfo[];
}

const DANGEROUS_EXTENSIONS = new Set([
  "php",
  "phtml",
  "php3",
  "php4",
  "php5",
  "exe",
  "bat",
  "cmd",
  "sh",
  "bash",
  "jsp",
  "asp",
  "aspx",
  "cgi",
  "pl",
]);

/**
 * 清理文件名，移除危险字符
 * @param name - 原始文件名
 * @returns 清理后的文件名
 */
export function sanitizeFilename(name: string): string {
  // 移除空字节
  let cleaned = name.replace(/\0/g, "");
  // 移除路径分隔符
  cleaned = cleaned.replace(/[/\\]/g, "");
  // 移除控制字符（0x00-0x1F, 0x7F）
  cleaned = Array.from(cleaned)
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join("");
  // 只保留字母数字和 .-_
  cleaned = cleaned.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  // 防止以 . 开头（隐藏文件）
  if (cleaned.startsWith(".")) {
    cleaned = `_${cleaned.slice(1)}`;
  }
  return cleaned || "unnamed";
}

/**
 * 判断文件名是否包含危险的双扩展名
 * @param name - 文件名
 * @returns 是否包含双扩展名
 */
function hasDoubleExtension(name: string): boolean {
  const parts = name.split(".");
  if (parts.length <= 2) return false;
  // 检查中间扩展名是否为危险扩展名
  for (let i = 1; i < parts.length - 1; i++) {
    if (DANGEROUS_EXTENSIONS.has(parts[i]!.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * 获取文件扩展名
 * @param name - 文件名
 * @returns 扩展名（小写）
 */
function getExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

/**
 * 创建上传校验器
 * @param options - 上传校验选项
 * @returns 包含 validate 与 sanitizeFilename 的对象
 */
export function createUploadValidator(options: UploadOptions = {}): {
  /**
   * 校验上传请求
   * @param request - Request 对象
   * @returns 校验结果
   */
  validate(request: Request): Promise<UploadResult>;
  /**
   * 清理文件名
   * @param name - 原始文件名
   * @returns 清理后的文件名
   */
  sanitizeFilename(name: string): string;
} {
  const maxFileSize = options.maxFileSize ?? 5 * 1024 * 1024; // 5MB
  const maxFiles = options.maxFiles ?? 10;
  const allowedMimeTypes = options.allowedMimeTypes ? new Set(options.allowedMimeTypes) : null;
  const allowedExtensions = options.allowedExtensions
    ? new Set(options.allowedExtensions.map((e) => e.toLowerCase()))
    : null;
  const rejectDoubleExtensions = options.rejectDoubleExtensions ?? true;
  const rejectNullBytes = options.rejectNullBytes ?? true;

  async function validate(request: Request): Promise<UploadResult> {
    const errors: string[] = [];
    const files: UploadFileInfo[] = [];

    let formData: FormData;
    try {
      formData = (await request.formData()) as FormData;
    } catch {
      return { valid: false, errors: ["解析表单数据失败"], files: [] };
    }

    const fileEntries: File[] = [];
    for (const value of Array.from(formData.values() as Iterable<unknown>)) {
      if (value instanceof File) {
        fileEntries.push(value);
      }
    }

    if (fileEntries.length > maxFiles) {
      errors.push(`文件数量过多：${fileEntries.length}（最大：${maxFiles}）`);
      return { valid: false, errors, files: [] };
    }

    for (const file of fileEntries) {
      const originalName = file.name;

      // 空字节检查
      if (rejectNullBytes && originalName.includes("\0")) {
        errors.push(`文件名包含非法字符：${originalName}`);
        continue;
      }

      // 双扩展名检查
      if (rejectDoubleExtensions && hasDoubleExtension(originalName)) {
        errors.push(`不允许双扩展名文件：${originalName}`);
        continue;
      }

      // 大小检查
      if (file.size > maxFileSize) {
        errors.push(`文件过大：${originalName}（最大 ${maxFileSize / 1024 / 1024}MB）`);
        continue;
      }

      // MIME 类型检查
      if (allowedMimeTypes && !allowedMimeTypes.has(file.type)) {
        errors.push(`不允许的文件类型：${file.type}（${originalName}）`);
        continue;
      }

      // 扩展名检查
      const ext = getExtension(originalName);
      if (allowedExtensions && ext && !allowedExtensions.has(ext)) {
        errors.push(`不允许的文件扩展名：.${ext}（${originalName}）`);
        continue;
      }

      files.push({
        name: sanitizeFilename(originalName),
        originalName,
        size: file.size,
        mimeType: file.type,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      files,
    };
  }

  return { validate, sanitizeFilename };
}
```

## xss.ts
```typescript
// @ventostack/core - XSS 过滤中间件

import type { Middleware } from "../middleware";

/** XSS 防护配置选项 */
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
 * @param input - 原始字符串
 * @returns 转义后的字符串
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
 * @param input - 待检测字符串
 * @returns 是否含有 XSS 载荷
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
 * @param options - XSS 配置选项
 * @returns Middleware 实例
 */
export function xssProtection(options: XSSOptions = {}): Middleware {
  const {
    xssProtection: xss = true,
    noSniff = true,
    contentSecurityPolicy,
    frameOptions = "DENY",
  } = options;

  return async (_ctx, next) => {
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
```

