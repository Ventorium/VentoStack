/**
 * @ventostack/integration - Slack Webhook 验证器
 * 验证 X-Slack-Signature 头中的 HMAC-SHA256 签名
 * 格式: v0=<hex>
 * 签名内容: "v0:" + timestamp + ":" + rawBody
 * 时间戳在 X-Slack-Request-Timestamp 头
 * 默认 5 分钟时间容差
 */

import type { ProviderVerifyConfig, VerifyResult, WebhookProviderVerifier } from "@ventostack/webhook";
import { hmacSign, timingSafeEqual } from "@ventostack/webhook";

const DEFAULT_TOLERANCE = 5 * 60 * 1000; // 5 分钟

/**
 * 创建 Slack Webhook 验证器
 * @returns Slack Provider 验证器
 */
export function createSlackVerifier(): WebhookProviderVerifier {
  return {
    provider: "slack",

    async verify(
      rawBody: string,
      headers: Record<string, string>,
      config: ProviderVerifyConfig,
    ): Promise<VerifyResult> {
      if (!config.secret) {
        return { valid: false, reason: "Missing secret" };
      }

      const signatureHeader = headers["x-slack-signature"];
      if (!signatureHeader) {
        return { valid: false, reason: "Missing X-Slack-Signature header" };
      }

      const timestampHeader = headers["x-slack-request-timestamp"];
      if (!timestampHeader) {
        return { valid: false, reason: "Missing X-Slack-Request-Timestamp header" };
      }

      // 格式: v0=<hex>
      if (!signatureHeader.startsWith("v0=")) {
        return { valid: false, reason: "Invalid signature format" };
      }

      const timestamp = Number.parseInt(timestampHeader, 10);
      if (Number.isNaN(timestamp)) {
        return { valid: false, reason: "Invalid timestamp" };
      }

      // 时间容差校验
      const tolerance = config.timestampTolerance ?? DEFAULT_TOLERANCE;
      const now = Date.now();
      if (Math.abs(now - timestamp * 1000) > tolerance) {
        return { valid: false, reason: "Timestamp outside tolerance" };
      }

      // 签名: hmac_sha256(secret, "v0:" + timestamp + ":" + rawBody)
      const sigBaseString = `v0:${timestamp}:${rawBody}`;
      const expected = `v0=${hmacSign(sigBaseString, config.secret, "sha256")}`;

      if (!timingSafeEqual(signatureHeader, expected)) {
        return { valid: false, reason: "Signature mismatch" };
      }

      return { valid: true };
    },
  };
}
