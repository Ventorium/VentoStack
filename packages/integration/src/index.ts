/**
 * @ventostack/integration - 第三方平台 Webhook 验证器集合
 * 提供常见平台的入站签名验证实现，每个验证器实现 @ventostack/webhook 的 WebhookProviderVerifier 接口
 *
 * 支持平台：
 * - Stripe（HMAC-SHA256，时间戳，密钥轮换）
 * - GitHub（HMAC-SHA256）
 * - 钉钉 DingTalk（HMAC-SHA256，URL query 签名）
 * - Slack（HMAC-SHA256，时间戳）
 * - Shopify（HMAC-SHA256，Base64 编码）
 * - 微信支付 WeChat Pay（RSA-SHA256，非对称验签）
 * - 支付宝 Alipay（RSA2/SHA256WithRSA，非对称验签）
 */

/** Stripe Webhook 验证器 */
export { createStripeVerifier } from "./providers/stripe";

/** GitHub Webhook 验证器 */
export { createGitHubVerifier } from "./providers/github";

/** 钉钉 Webhook 验证器 */
export { createDingTalkVerifier } from "./providers/dingtalk";

/** Slack Webhook 验证器 */
export { createSlackVerifier } from "./providers/slack";

/** Shopify Webhook 验证器 */
export { createShopifyVerifier } from "./providers/shopify";

/** 微信支付 Webhook 验证器 */
export { createWeChatPayVerifier } from "./providers/wechat-pay";

/** 支付宝 Webhook 验证器 */
export { createAlipayVerifier } from "./providers/alipay";
