/**
 * @ventostack/integration - 微信支付 Webhook 验证器
 * 验证 Wechatpay-Signature 头中的 RSA-SHA256 签名
 * 签名内容: timestamp + "\n" + nonce + "\n" + body + "\n"
 * 需要微信支付平台证书公钥（PEM 格式）
 * 支持多证书按 Wechatpay-Serial 头选择
 *
 * config.extra 可包含:
 * - certificates: Record<string, string> — 证书序列号 → PEM 公钥映射
 */

import type { ProviderVerifyConfig, VerifyResult, WebhookProviderVerifier } from "@ventostack/webhook";
import { rsaSha256Verify } from "@ventostack/webhook";

/**
 * 创建微信支付 Webhook 验证器
 * @returns 微信支付 Provider 验证器
 */
export function createWeChatPayVerifier(): WebhookProviderVerifier {
  return {
    provider: "wechat-pay",

    async verify(
      rawBody: string,
      headers: Record<string, string>,
      config: ProviderVerifyConfig,
    ): Promise<VerifyResult> {
      const signatureHeader = headers["wechatpay-signature"];
      if (!signatureHeader) {
        return { valid: false, reason: "Missing Wechatpay-Signature header" };
      }

      const timestamp = headers["wechatpay-timestamp"];
      if (!timestamp) {
        return { valid: false, reason: "Missing Wechatpay-Timestamp header" };
      }

      const nonce = headers["wechatpay-nonce"];
      if (!nonce) {
        return { valid: false, reason: "Missing Wechatpay-Nonce header" };
      }

      const serial = headers["wechatpay-serial"];

      // 获取公钥: 优先从 certificates 映射按 serial 查找，否则用 config.publicKey
      let publicKey = config.publicKey;
      if (config.extra?.certificates && typeof config.extra.certificates === "object") {
        const certs = config.extra.certificates as Record<string, string>;
        if (serial && certs[serial]) {
          publicKey = certs[serial];
        }
      }

      if (!publicKey) {
        return { valid: false, reason: "Missing public key" };
      }

      // 构造待签名字符串: timestamp + "\n" + nonce + "\n" + body + "\n"
      const message = `${timestamp}\n${nonce}\n${rawBody}\n`;

      const isValid = await rsaSha256Verify(message, signatureHeader, publicKey);

      if (!isValid) {
        return { valid: false, reason: "Signature mismatch" };
      }

      return {
        valid: true,
        metadata: { serial, timestamp, nonce },
      };
    },
  };
}
