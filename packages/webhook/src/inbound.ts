/**
 * @ventostack/webhook - 入站 Webhook 验证器
 * 通过 Provider 体系验证入站签名，转换为统一 WebhookEvent
 */

import type {
  InboundVerifier,
  ProviderVerifyConfig,
  VerifyResult,
  WebhookEvent,
  WebhookProviderVerifier,
} from "./types";
import { hmacSign, timingSafeEqual } from "./crypto";

/**
 * 创建入站 Webhook 验证器
 * @param options 验证器配置
 * @returns 入站验证器实例
 */
export function createInboundVerifier(options: {
  provider: WebhookProviderVerifier;
  config: ProviderVerifyConfig;
  source?: string;
}): InboundVerifier {
  const source = options.source ?? options.provider.provider;

  return {
    async verifyAndConvert(
      rawBody: string,
      headers: Record<string, string>,
    ): Promise<WebhookEvent> {
      const result = await options.provider.verify(rawBody, headers, options.config);

      if (!result.valid) {
        throw new Error(
          `Webhook verification failed: ${result.reason ?? "invalid signature"}`,
        );
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
 * @param algorithm HMAC 算法
 * @param headerName 签名头名称
 * @returns Provider 验证器
 */
export function createGenericHmacVerifier(
  algorithm: "sha256" | "sha384" | "sha512" = "sha256",
  headerName = "x-signature",
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

      const signature = headers[headerName];
      if (!signature) {
        return { valid: false, reason: `Missing ${headerName} header` };
      }

      const expected = hmacSign(rawBody, config.secret, algorithm);

      // 支持带前缀格式如 "sha256=xxx"
      const expectedWithPrefix = `${algorithm}=${expected}`;
      const match =
        timingSafeEqual(signature, expected) ||
        timingSafeEqual(signature, expectedWithPrefix);

      if (!match) {
        return { valid: false, reason: "Signature mismatch" };
      }

      return { valid: true };
    },
  };
}
