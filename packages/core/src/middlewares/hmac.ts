// @aeron/core - HMAC 请求签名中间件

import { timingSafeEqual } from "node:crypto";
import type { Context } from "../context";
import type { Middleware } from "../middleware";

export interface HMACOptions {
  secret: string;
  algorithm?: "SHA-256" | "SHA-384" | "SHA-512";
  header?: string;
  timestampHeader?: string;
  nonceHeader?: string;
  maxAge?: number;
}

const ALGO_MAP: Record<string, string> = {
  "SHA-256": "SHA-256",
  "SHA-384": "SHA-384",
  "SHA-512": "SHA-512",
};

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

export function createHMACSigner(options: HMACOptions): {
  sign(
    method: string,
    path: string,
    body?: string,
    timestamp?: number,
    nonce?: string,
  ): Promise<{ signature: string; timestamp: number; nonce: string }>;
  verify(request: Request): Promise<{ valid: boolean; reason?: string }>;
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

  async function verify(
    request: Request,
  ): Promise<{ valid: boolean; reason?: string }> {
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

    const ts = parseInt(tsStr, 10);
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

    const expected = await computeSignature(
      request.method,
      url.pathname,
      body,
      ts,
      nonceVal,
    );

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
        return new Response(
          JSON.stringify({ error: result.reason }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return next();
    };
  }

  return { sign, verify, middleware };
}
