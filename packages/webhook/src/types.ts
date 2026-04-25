/**
 * @ventostack/webhook - 统一事件模型与共享接口
 * 所有 webhook（入站/出站）统一为 WebhookEvent，通过 Provider 体系支持多平台验证
 */

/** 统一 Webhook 事件模型 */
export interface WebhookEvent {
  /** 事件唯一标识 */
  id: string;
  /** 事件类型（e.g. "payment.completed", "issue.opened"） */
  type: string;
  /** 来源标识（入站为 provider 名，出站为应用名） */
  source: string;
  /** 事件数据 */
  payload: unknown;
  /** 元数据（可选） */
  metadata?: Record<string, unknown>;
  /** 事件发生时间戳（毫秒） */
  timestamp: number;
}

/** Provider 验证器接口 */
export interface WebhookProviderVerifier {
  /** Provider 标识（e.g. "stripe", "github"） */
  readonly provider: string;
  /**
   * 验证入站 webhook 签名
   * @param rawBody 原始请求体字符串
   * @param headers 请求头（key 小写）
   * @param config 验证配置
   * @returns 验证结果
   */
  verify(
    rawBody: string,
    headers: Record<string, string>,
    config: ProviderVerifyConfig,
  ): Promise<VerifyResult>;
}

/** Provider 验证配置 */
export interface ProviderVerifyConfig {
  /** HMAC 密钥或签名密钥 */
  secret?: string;
  /** RSA 公钥（PEM 格式），用于非对称验证 */
  publicKey?: string;
  /** 时间戳容差（毫秒），默认按各 Provider 规范 */
  timestampTolerance?: number;
  /** 额外参数（钉钉的 query params、支付宝的 body params 等） */
  extra?: Record<string, unknown>;
}

/** 验证结果 */
export interface VerifyResult {
  /** 签名是否有效 */
  valid: boolean;
  /** 失败原因 */
  reason?: string;
  /** Provider 提取的事件类型 */
  eventType?: string;
  /** Provider 特定元数据 */
  metadata?: Record<string, unknown>;
}

/** 出站 Webhook 订阅 */
export interface WebhookSubscription {
  /** 订阅唯一标识 */
  id: string;
  /** 目标 URL */
  url: string;
  /** 签名密钥 */
  secret: string;
  /** 订阅的事件列表（空数组 = 订阅所有事件） */
  events: string[];
  /** 是否启用 */
  active: boolean;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 创建时间戳 */
  createdAt: number;
}

/** 出站 Webhook 投递记录 */
export interface WebhookDelivery {
  /** 投递唯一标识 */
  id: string;
  /** 订阅 ID */
  subscriptionId: string;
  /** 事件名称 */
  event: string;
  /** 请求载荷 */
  payload: unknown;
  /** 事件来源（可选，由 sendEvent 传入） */
  source?: string;
  /** 事件元数据（可选，由 sendEvent 传入） */
  eventMetadata?: Record<string, unknown>;
  /** 原始事件 ID（可选，由 sendEvent 传入） */
  eventId?: string;
  /** 原始事件时间戳（可选，由 sendEvent 传入） */
  eventTimestamp?: number;
  /** 投递状态 */
  status: "pending" | "sent" | "failed" | "dead";
  /** HTTP 响应状态码 */
  statusCode?: number;
  /** 已尝试次数 */
  attempts: number;
  /** 最大尝试次数 */
  maxAttempts: number;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后尝试时间戳 */
  lastAttemptAt?: number;
  /** 下次重试时间戳 */
  nextRetryAt?: number;
  /** 错误信息 */
  error?: string;
  /** 请求签名 */
  signature?: string;
}

/** 出站管理器配置 */
export interface OutboundManagerOptions {
  /** 最大重试次数，默认 5 */
  maxRetries?: number;
  /** 初始重试间隔（毫秒），默认 1000 */
  retryInterval?: number;
  /** 最大重试间隔（毫秒），默认 60000 */
  maxRetryInterval?: number;
  /** 投递超时（毫秒），默认 10000 */
  deliveryTimeout?: number;
  /** 签名算法，默认 "sha256" */
  signatureAlgorithm?: "sha256" | "sha384" | "sha512";
  /** 签名头名称，默认 "X-Webhook-Signature" */
  signatureHeader?: string;
  /** 自定义 fetch 函数（便于测试） */
  fetch?: typeof fetch;
}

/** 出站 Webhook 管理器接口 */
export interface OutboundWebhookManager {
  subscribe(config: Omit<WebhookSubscription, "id" | "createdAt">): string;
  unsubscribe(subscriptionId: string): boolean;
  getSubscription(subscriptionId: string): WebhookSubscription | undefined;
  listSubscriptions(filter?: { event?: string; active?: boolean }): WebhookSubscription[];
  send(event: string, payload: unknown, context?: { source?: string; metadata?: Record<string, unknown>; eventId?: string; eventTimestamp?: number }): Promise<string[]>;
  sendEvent(event: WebhookEvent): Promise<string[]>;
  retry(): Promise<number>;
  getDelivery(deliveryId: string): WebhookDelivery | undefined;
  listDeliveries(filter?: {
    subscriptionId?: string;
    event?: string;
    status?: WebhookDelivery["status"];
  }): WebhookDelivery[];
  stats(): { subscriptions: number; pending: number; sent: number; failed: number; dead: number };
  sign(payload: unknown, secret: string): string;
  /** 清理所有资源：定时器、订阅、投递记录 */
  destroy(): void;
}

/** 入站验证器接口 */
export interface InboundVerifier {
  /**
   * 验证入站 webhook 并转换为统一事件
   * @param rawBody 原始请求体
   * @param headers 请求头
   * @returns 统一 Webhook 事件
   * @throws Error 签名无效时抛出
   */
  verifyAndConvert(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent>;
}
