---
title: Webhook 模块
description: 出站投递、入站验证、加密工具的统一 Webhook 基础设施
---

# Webhook 模块

`@ventostack/webhook` 提供 VentoStack 的 Webhook 基础设施，包括统一事件模型、出站管理器、入站验证器和加密工具。

## 统一事件模型

所有 Webhook（入站/出站）统一为 `WebhookEvent`：

```ts
interface WebhookEvent {
  id: string;                              // 事件唯一标识
  type: string;                            // 事件类型，如 "payment.completed"
  source: string;                          // 来源标识
  payload: unknown;                        // 事件数据
  metadata?: Record<string, unknown>;      // 可选元数据
  timestamp: number;                       // 事件时间戳（毫秒）
}
```

## 出站 Webhook 管理器

### 创建管理器

```ts
import { createOutboundWebhookManager } from "@ventostack/webhook";

const manager = createOutboundWebhookManager(options?);
```

```ts
function createOutboundWebhookManager(
  options?: OutboundManagerOptions
): OutboundWebhookManager
```

### 配置选项

```ts
interface OutboundManagerOptions {
  maxRetries?: number;          // 最大重试次数，默认 5
  retryInterval?: number;       // 初始重试间隔（ms），默认 1000
  maxRetryInterval?: number;    // 最大重试间隔（ms），默认 60000
  deliveryTimeout?: number;     // 投递超时（ms），默认 10000
  signatureAlgorithm?: "sha256" | "sha384" | "sha512"; // 默认 "sha256"
  signatureHeader?: string;     // 签名头名称，默认 "X-Webhook-Signature"
  fetch?: typeof fetch;         // 自定义 fetch（便于测试）
}
```

### 核心方法

```ts
// 订阅管理
subscribe(config: Omit<WebhookSubscription, "id" | "createdAt">): string;
unsubscribe(subscriptionId: string): boolean;
listSubscriptions(filter?: { event?: string; active?: boolean }): WebhookSubscription[];

// 事件投递
send(event: string, payload: unknown, context?): Promise<string[]>;
sendEvent(event: WebhookEvent): Promise<string[]>;

// 重试与查询
retry(): Promise<number>;
getDelivery(deliveryId: string): WebhookDelivery | undefined;
listDeliveries(filter?: { subscriptionId?; event?; status? }): WebhookDelivery[];
stats(): { subscriptions; pending; sent; failed; dead };

// 资源清理
destroy(): void;
```

投递流程：签名 → POST 请求 → 成功标记 `sent`；失败后根据指数退避重试，超过最大次数标记为 `dead`（死信）。

## 入站 Webhook 验证器

### createInboundVerifier

通过 Provider 验证入站签名并转换为统一 `WebhookEvent`：

```ts
import { createInboundVerifier } from "@ventostack/webhook";

const verifier = createInboundVerifier({
  provider: myProviderVerifier,   // 实现 WebhookProviderVerifier 接口
  config: { secret: "xxx" },      // ProviderVerifyConfig
  source: "stripe",               // 可选，默认使用 provider 名称
});

const event = await verifier.verifyAndConvert(rawBody, headers);
```

```ts
function createInboundVerifier(options: {
  provider: WebhookProviderVerifier;
  config: ProviderVerifyConfig;
  source?: string;
}): InboundVerifier
```

### createGenericHmacVerifier

不依赖 `@ventostack/integration` 的通用 HMAC 验证器：

```ts
import { createGenericHmacVerifier } from "@ventostack/webhook";

const verifier = createGenericHmacVerifier("sha256", "x-signature");
```

```ts
function createGenericHmacVerifier(
  algorithm?: "sha256" | "sha384" | "sha512",  // 默认 "sha256"
  headerName?: string                           // 默认 "x-signature"
): WebhookProviderVerifier
```

支持带前缀格式（如 `sha256=xxx`）和纯签名格式。

## 加密工具

```ts
import {
  hmacSign,
  timingSafeEqual,
  exponentialBackoff,
  rsaSha256Verify,
} from "@ventostack/webhook";
```

| 函数 | 签名 | 说明 |
|------|------|------|
| `hmacSign` | `(body: string, secret: string, algorithm: string) => string` | HMAC 签名，返回十六进制字符串 |
| `timingSafeEqual` | `(a: string, b: string) => boolean` | 恒定时间比较，防止时序攻击 |
| `exponentialBackoff` | `(attempt: number, baseInterval: number, maxInterval: number) => number` | 指数退避间隔，含随机抖动 |
| `rsaSha256Verify` | `(payload: string, signature: string, publicKeyPem: string) => Promise<boolean>` | RSA-SHA256 非对称验签，用于微信支付/支付宝等 |

## 类型导出

```ts
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
} from "@ventostack/webhook";
```
