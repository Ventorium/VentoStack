/**
 * @ventostack/webhook - 入站 Webhook 验证器
 * 通过 Provider 体系验证入站签名，转换为统一 WebhookEvent
 */

import { hmacSign, timingSafeEqual } from "./crypto";
import type {
  InboundVerifier,
  ProviderVerifyConfig,
  VerifyResult,
  WebhookEvent,
  WebhookProviderVerifier,
} from "./types";

/** 默认时间戳容差：5 分钟 */
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * 创建入站 Webhook 验证器
 * @param options 验证器配置
 * @returns 入站验证器实例
 */
export function createInboundVerifier(options: {
  provider: WebhookProviderVerifier;
  config: ProviderVerifyConfig;
  source?: string;
  /**
   * 可选：nonce 去重器（防重放）。
   * 返回 true 表示该 nonce 首次出现（允许处理），返回 false 表示重复（拒绝）。
   * 典型实现：Redis SETNX / 数据库唯一约束。
   * @param nonce 请求中的 nonce 值（如 x-webhook-nonce 头）
   * @returns true=首次出现，允许；false=重复，拒绝
   */
  nonceChecker?: (nonce: string) => Promise<boolean>;
  /** nonce 头名称，默认 "x-webhook-nonce" */
  nonceHeader?: string;
}): InboundVerifier {
  const source = options.source ?? options.provider.provider;
  const nonceHeader = options.nonceHeader ?? "x-webhook-nonce";

  return {
    async verifyAndConvert(
      rawBody: string,
      headers: Record<string, string>,
    ): Promise<WebhookEvent> {
      const result = await options.provider.verify(rawBody, headers, options.config);

      if (!result.valid) {
        throw new Error(`Webhook verification failed: ${result.reason ?? "invalid signature"}`);
      }

      // 防重放：nonce 去重（可选，需提供 nonceChecker）
      if (options.nonceChecker) {
        const nonce = headers[nonceHeader];
        if (!nonce) {
          throw new Error(
            `Webhook verification failed: Missing ${nonceHeader} header (required for replay protection)`,
          );
        }
        const isFirstSeen = await options.nonceChecker(nonce);
        if (!isFirstSeen) {
          throw new Error(`Webhook verification failed: Duplicate nonce (replay detected)`);
        }
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = rawBody;
      }

      const event: WebhookEvent = {
        id: crypto.randomUUID(),
        type: result.eventType ?? "webhook.received",
        source,
        payload,
        timestamp: Date.now(),
      };

      if (result.metadata) {
        event.metadata = result.metadata;
      }

      return event;
    },
  };
}

/**
 * 创建通用 HMAC 验证器（不依赖 integration 包即可使用）
 *
 * 内置防重放：校验 x-timestamp 头（时间戳容差默认 5 分钟）。
 * 通过 config.timestampTolerance 调整容差（毫秒）；设为 0 可显式关闭时间戳校验。
 *
 * @param algorithm HMAC 算法
 * @param headerName 签名头名称
 * @param timestampHeader 时间戳头名称，默认 "x-timestamp"
 * @returns Provider 验证器
 */
export function createGenericHmacVerifier(
  algorithm: "sha256" | "sha384" | "sha512" = "sha256",
  headerName = "x-signature",
  timestampHeader = "x-timestamp",
): WebhookProviderVerifier {
  return {
    provider: `generic-hmac-${algorithm}`,

    async verify(
      rawBody: string,
      headers: Record<string, string>,
      config: ProviderVerifyConfig,
    ): Promise<VerifyResult> {
      if (!config.secret) {
        return { valid: false, reason: "Missing secret" };
      }

      // 时间戳防重放：容差窗口内校验（设为 0 显式关闭）
      const tolerance = config.timestampTolerance ?? DEFAULT_TIMESTAMP_TOLERANCE_MS;
      if (tolerance > 0) {
        const timestamp = headers[timestampHeader];
        if (!timestamp) {
          return { valid: false, reason: `Missing ${timestampHeader} header` };
        }
        const ts = Number(timestamp);
        if (!Number.isFinite(ts)) {
          return { valid: false, reason: `Invalid ${timestampHeader} header` };
        }
        const skew = Math.abs(Date.now() - ts);
        if (skew > tolerance) {
          return { valid: false, reason: `Timestamp out of tolerance window (±${tolerance}ms)` };
        }
      }

      const signature = headers[headerName];
      if (!signature) {
        return { valid: false, reason: `Missing ${headerName} header` };
      }

      const expected = hmacSign(rawBody, config.secret, algorithm);

      // 支持带前缀格式如 "sha256=xxx"
      const expectedWithPrefix = `${algorithm}=${expected}`;
      const match =
        timingSafeEqual(signature, expected) || timingSafeEqual(signature, expectedWithPrefix);

      if (!match) {
        return { valid: false, reason: "Signature mismatch" };
      }

      return { valid: true };
    },
  };
}
