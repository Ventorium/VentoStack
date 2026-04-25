/**
 * @ventostack/integration - 支付宝 Webhook 验证器
 * 签名在 body 参数中: sign + sign_type
 * 签名内容: 排除 sign/sign_type/空值后按 key 字典排序的 key=value&...
 * 算法: RSA2 (SHA256WithRSA)
 * 需要支付宝公钥（PEM 格式）
 *
 * config.extra 必须包含:
 * - bodyParams: Record<string, string> — 解析后的请求体参数
 */

import type { ProviderVerifyConfig, VerifyResult, WebhookProviderVerifier } from "@ventostack/webhook";
import { rsaSha256Verify } from "@ventostack/webhook";

/**
 * 创建支付宝 Webhook 验证器
 * @returns 支付宝 Provider 验证器
 */
export function createAlipayVerifier(): WebhookProviderVerifier {
  return {
    provider: "alipay",

    async verify(
      _rawBody: string,
      _headers: Record<string, string>,
      config: ProviderVerifyConfig,
    ): Promise<VerifyResult> {
      if (!config.publicKey) {
        return { valid: false, reason: "Missing public key" };
      }

      const bodyParams = config.extra?.bodyParams as Record<string, string> | undefined;
      if (!bodyParams || typeof bodyParams !== "object") {
        return { valid: false, reason: "Missing bodyParams in config.extra" };
      }

      const sign = bodyParams["sign"];
      if (!sign) {
        return { valid: false, reason: "Missing sign parameter" };
      }

      // 构造待签名字符串:
      // 1. 排除 sign、sign_type 和空值参数
      // 2. 按 key 字典排序
      // 3. 用 & 连接 key=value
      const sortedKeys = Object.keys(bodyParams)
        .filter((key) => key !== "sign" && key !== "sign_type" && bodyParams[key] !== "")
        .sort();

      const signString = sortedKeys
        .map((key) => `${key}=${bodyParams[key]}`)
        .join("&");

      const isValid = await rsaSha256Verify(signString, sign, config.publicKey);

      if (!isValid) {
        return { valid: false, reason: "Signature mismatch" };
      }

      const result: VerifyResult = { valid: true };
      const notifyType = bodyParams["notify_type"];
      if (notifyType) result.eventType = notifyType;

      const metadata: Record<string, unknown> = {};
      if (bodyParams["trade_no"]) metadata.tradeNo = bodyParams["trade_no"];
      if (bodyParams["out_trade_no"]) metadata.outTradeNo = bodyParams["out_trade_no"];
      if (bodyParams["trade_status"]) metadata.tradeStatus = bodyParams["trade_status"];
      if (Object.keys(metadata).length > 0) result.metadata = metadata;

      return result;
    },
  };
}
