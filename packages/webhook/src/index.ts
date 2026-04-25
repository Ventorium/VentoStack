/**
 * @ventostack/webhook - Webhook 出站投递与入站验证
 *
 * 提供 VentoStack 框架的 Webhook 基础设施，包括：
 * - 统一事件模型（WebhookEvent）
 * - 出站 Webhook 管理器（订阅、签名投递、重试、死信）
 * - 入站 Webhook 验证器（可扩展 Provider 体系）
 * - 加密工具（HMAC 签名、RSA 验签、恒定时间比较）
 */

/** 统一事件模型与共享接口 */
export type {
  WebhookEvent,
  WebhookProviderVerifier,
  ProviderVerifyConfig,
  VerifyResult,
  WebhookSubscription,
  WebhookDelivery,
  OutboundManagerOptions,
  OutboundWebhookManager,
  InboundVerifier,
} from "./types";

/** 加密工具（供 integration 包和高级用户使用） */
export { hmacSign, timingSafeEqual, exponentialBackoff, rsaSha256Verify } from "./crypto";

/** 创建出站 Webhook 管理器 */
export { createOutboundWebhookManager } from "./outbound";

/** 创建入站 Webhook 验证器与通用 HMAC 验证器 */
export { createInboundVerifier, createGenericHmacVerifier } from "./inbound";
