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

  // 简易互斥锁，确保单进程内 nonce 检查和记录的原子性
  // 注意：在多进程/多实例部署中，仍需依赖外部存储（如 Redis）实现跨进程去重
  let nonceLock = false;
  const nonceQueue: Array<() => void> = [];

  function acquireNonceLock(): Promise<void> {
    if (!nonceLock) {
      nonceLock = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      nonceQueue.push(resolve);
    });
  }

  function releaseNonceLock(): void {
    if (nonceQueue.length > 0) {
      const next = nonceQueue.shift()!;
      // 保持 lock 为 true，直接传递给下一个等待者
      next();
    } else {
      nonceLock = false;
    }
  }

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

    // 原子性检查 nonce：获取锁 -> 检查是否重复 -> 校验签名 -> 记录 nonce -> 释放锁
    // 这防止了并发请求中同一 nonce 被多次接受的竞态条件
    await acquireNonceLock();
    try {
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
    } finally {
      releaseNonceLock();
    }
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
