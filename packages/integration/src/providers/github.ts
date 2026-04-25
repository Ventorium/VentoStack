/**
 * @ventostack/integration - GitHub Webhook 验证器
 * 验证 X-Hub-Signature-256 头中的 HMAC-SHA256 签名
 * 格式: sha256=<hex>
 * 签名内容: rawBody
 * 无时间戳/重放保护
 */

import type { ProviderVerifyConfig, VerifyResult, WebhookProviderVerifier } from "@ventostack/webhook";
import { hmacSign, timingSafeEqual } from "@ventostack/webhook";

/**
 * 创建 GitHub Webhook 验证器
 * @returns GitHub Provider 验证器
 */
export function createGitHubVerifier(): WebhookProviderVerifier {
  return {
    provider: "github",

    async verify(
      rawBody: string,
      headers: Record<string, string>,
      config: ProviderVerifyConfig,
    ): Promise<VerifyResult> {
      if (!config.secret) {
        return { valid: false, reason: "Missing secret" };
      }

      const signatureHeader = headers["x-hub-signature-256"];
      if (!signatureHeader) {
        return { valid: false, reason: "Missing X-Hub-Signature-256 header" };
      }

      // 格式: sha256=<hex>
      if (!signatureHeader.startsWith("sha256=")) {
        return { valid: false, reason: "Invalid signature format" };
      }

      const signature = signatureHeader.slice(7); // 去掉 "sha256=" 前缀
      const expected = hmacSign(rawBody, config.secret, "sha256");

      if (!timingSafeEqual(signature, expected)) {
        return { valid: false, reason: "Signature mismatch" };
      }

      // GitHub 通过 X-GitHub-Event 头传递事件类型
      const eventType = headers["x-github-event"];

      const result: VerifyResult = { valid: true };
      if (eventType) {
        result.eventType = `github.${eventType}`;
        result.metadata = { githubEvent: eventType };
      }
      return result;
    },
  };
}
