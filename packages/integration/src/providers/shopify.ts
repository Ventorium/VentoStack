/**
 * @ventostack/integration - Shopify Webhook 验证器
 * 验证 X-Shopify-Hmac-SHA256 头中的 HMAC-SHA256 签名
 * 签名内容: rawBody
 * 编码: Base64（不是 hex）
 * 无时间戳/重放保护
 */

import type { ProviderVerifyConfig, VerifyResult, WebhookProviderVerifier } from "@ventostack/webhook";
import { timingSafeEqual } from "@ventostack/webhook";

/**
 * 创建 Shopify Webhook 验证器
 * @returns Shopify Provider 验证器
 */
export function createShopifyVerifier(): WebhookProviderVerifier {
  return {
    provider: "shopify",

    async verify(
      rawBody: string,
      headers: Record<string, string>,
      config: ProviderVerifyConfig,
    ): Promise<VerifyResult> {
      if (!config.secret) {
        return { valid: false, reason: "Missing secret" };
      }

      const signatureHeader = headers["x-shopify-hmac-sha256"];
      if (!signatureHeader) {
        return { valid: false, reason: "Missing X-Shopify-Hmac-SHA256 header" };
      }

      // Shopify 使用 Base64 编码
      const hasher = new Bun.CryptoHasher("sha256", config.secret);
      hasher.update(rawBody);
      const expected = Buffer.from(hasher.digest()).toString("base64");

      if (!timingSafeEqual(signatureHeader, expected)) {
        return { valid: false, reason: "Signature mismatch" };
      }

      // Shopify 通过 X-Shopify-Topic 头传递事件类型
      const topic = headers["x-shopify-topic"];

      const result: VerifyResult = { valid: true };
      if (topic) {
        result.eventType = topic;
        result.metadata = {
          shopifyTopic: topic,
          ...(headers["x-shopify-shop-domain"]
            ? { shopifyShopDomain: headers["x-shopify-shop-domain"] }
            : {}),
        };
      }
      return result;
    },
  };
}
