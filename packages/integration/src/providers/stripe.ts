/**
 * @ventostack/integration - Stripe Webhook 验证器
 * 验证 Stripe-Signature 头中的 HMAC-SHA256 签名
 * 格式: t=<timestamp>,v1=<signature>[,v1=<signature>]
 * 签名内容: timestamp + "." + rawBody
 * 默认 5 分钟时间容差，支持密钥轮换
 */

import type { ProviderVerifyConfig, VerifyResult, WebhookProviderVerifier } from "@ventostack/webhook";
import { hmacSign, timingSafeEqual } from "@ventostack/webhook";

const DEFAULT_TOLERANCE = 5 * 60 * 1000; // 5 分钟

/**
 * 创建 Stripe Webhook 验证器
 * @returns Stripe Provider 验证器
 */
export function createStripeVerifier(): WebhookProviderVerifier {
  return {
    provider: "stripe",

    async verify(
      rawBody: string,
      headers: Record<string, string>,
      config: ProviderVerifyConfig,
    ): Promise<VerifyResult> {
      if (!config.secret) {
        return { valid: false, reason: "Missing secret" };
      }

      const signatureHeader = headers["stripe-signature"];
      if (!signatureHeader) {
        return { valid: false, reason: "Missing Stripe-Signature header" };
      }

      // 解析 Stripe-Signature 头: t=<ts>,v1=<sig>[,v1=<sig>]
      const parts = signatureHeader.split(",");
      let timestamp: number | undefined;
      const v1Signatures: string[] = [];

      for (const part of parts) {
        const [key, ...valueParts] = part.split("=");
        const value = valueParts.join("=");
        if (key === "t") {
          timestamp = Number.parseInt(value, 10);
        } else if (key === "v1") {
          v1Signatures.push(value);
        }
      }

      if (timestamp === undefined || Number.isNaN(timestamp)) {
        return { valid: false, reason: "Invalid timestamp in Stripe-Signature" };
      }

      if (v1Signatures.length === 0) {
        return { valid: false, reason: "No v1 signature found" };
      }

      // 时间容差校验
      const tolerance = config.timestampTolerance ?? DEFAULT_TOLERANCE;
      const now = Date.now();
      if (Math.abs(now - timestamp * 1000) > tolerance) {
        return { valid: false, reason: "Timestamp outside tolerance" };
      }

      // 计算签名: hmac_sha256(secret, timestamp + "." + rawBody)
      const signedPayload = `${timestamp}.${rawBody}`;
      const expected = hmacSign(signedPayload, config.secret, "sha256");

      // 任何一个 v1 签名匹配即有效（密钥轮换）
      const isValid = v1Signatures.some((sig) => timingSafeEqual(sig, expected));

      if (!isValid) {
        return { valid: false, reason: "Signature mismatch" };
      }

      return {
        valid: true,
        metadata: { timestamp },
      };
    },
  };
}
