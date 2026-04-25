/**
 * @ventostack/integration - 钉钉 Webhook 验证器
 * 签名在 URL query params: timestamp + sign
 * 签名内容: timestamp + "\n" + secret
 * 算法: HmacSHA256 → Base64 → URL encode
 * 默认 1 小时时间容差
 *
 * 注意: timestamp 和 sign 通过 config.extra 传入
 * config.extra = { timestamp: string, sign: string }
 */

import type { ProviderVerifyConfig, VerifyResult, WebhookProviderVerifier } from "@ventostack/webhook";
import { timingSafeEqual } from "@ventostack/webhook";

const DEFAULT_TOLERANCE = 60 * 60 * 1000; // 1 小时

/**
 * HmacSHA256 + Base64（钉钉专用）
 */
function dingtalkHmacSign(message: string, secret: string): string {
  const hasher = new Bun.CryptoHasher("sha256", secret);
  hasher.update(message);
  return Buffer.from(hasher.digest()).toString("base64");
}

/**
 * 创建钉钉 Webhook 验证器
 * @returns 钉钉 Provider 验证器
 */
export function createDingTalkVerifier(): WebhookProviderVerifier {
  return {
    provider: "dingtalk",

    async verify(
      _rawBody: string,
      _headers: Record<string, string>,
      config: ProviderVerifyConfig,
    ): Promise<VerifyResult> {
      if (!config.secret) {
        return { valid: false, reason: "Missing secret" };
      }

      const timestamp = config.extra?.timestamp as string | undefined;
      const sign = config.extra?.sign as string | undefined;

      if (!timestamp || !sign) {
        return { valid: false, reason: "Missing timestamp or sign in config.extra" };
      }

      // 时间容差校验
      const tolerance = config.timestampTolerance ?? DEFAULT_TOLERANCE;
      const ts = Number.parseInt(timestamp, 10);
      if (Number.isNaN(ts)) {
        return { valid: false, reason: "Invalid timestamp" };
      }

      const now = Date.now();
      if (Math.abs(now - ts) > tolerance) {
        return { valid: false, reason: "Timestamp outside tolerance" };
      }

      // 验证签名: base64(hmac_sha256(secret, timestamp + "\n" + secret))
      const stringToSign = `${timestamp}\n${config.secret}`;
      const expected = dingtalkHmacSign(stringToSign, config.secret);

      // sign 经过 URL decode 后与 expected 比较
      const decodedSign = decodeURIComponent(sign);

      if (!timingSafeEqual(decodedSign, expected)) {
        return { valid: false, reason: "Signature mismatch" };
      }

      return { valid: true };
    },
  };
}
