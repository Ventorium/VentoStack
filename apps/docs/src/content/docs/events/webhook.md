---
title: Webhook
description: Webhook 出站投递与入站验证 — 统一事件模型 + Provider 体系
---

VentoStack 的 Webhook 系统由两个包组成：

- **`@ventostack/webhook`** — 出站管理器 + 入站验证器 + 统一事件模型
- **`@ventostack/integration`** — Stripe / GitHub / 钉钉 / Slack / Shopify / 微信支付 / 支付宝 验证器

## 统一事件模型

所有 webhook（入站/出站）统一为 `WebhookEvent`：

```typescript
interface WebhookEvent {
  id: string;           // 唯一标识
  type: string;         // 事件类型 (e.g. "payment.completed")
  source: string;       // 来源 (provider 名 或 app 名)
  payload: unknown;     // 事件数据
  metadata?: Record<string, unknown>;
  timestamp: number;    // 事件发生时间
}
```

## 出站管理器

```typescript
import { createOutboundWebhookManager } from "@ventostack/webhook";

const outbound = createOutboundWebhookManager({
  maxRetries: 5,                // 最大重试次数（默认 5）
  retryInterval: 1000,          // 初始重试间隔 ms（默认 1000）
  maxRetryInterval: 60000,      // 最大重试间隔 ms（默认 60000）
  deliveryTimeout: 10000,       // 投递超时 ms（默认 10000）
  signatureAlgorithm: "sha256", // sha256 | sha384 | sha512
  signatureHeader: "X-Webhook-Signature",
});
```

### 订阅管理

```typescript
// 注册订阅
const subId = outbound.subscribe({
  url: "https://partner.example.com/callback",
  secret: "whsec_...",
  events: ["order.created", "order.paid"], // 空数组 [] = 订阅所有事件
  active: true,
  headers: { "Authorization": "Bearer token" },
});

// 查询/移除
outbound.getSubscription(subId);
outbound.listSubscriptions({ event: "order.created", active: true });
outbound.unsubscribe(subId);
```

### 触发投递

```typescript
// 直接发送
const deliveryIds = await outbound.send("order.created", { orderId: "123" });

// 通过统一事件模型发送（与 EventBus 集成）
await outbound.sendEvent({
  id: crypto.randomUUID(),
  type: "order.created",
  source: "my-app",
  payload: { orderId: "123" },
  timestamp: Date.now(),
});
```

### 投递追踪

```typescript
outbound.getDelivery(deliveryId);
outbound.listDeliveries({ status: "failed" });
outbound.listDeliveries({ event: "order.created" });
await outbound.retry(); // 重试所有失败投递
outbound.stats(); // { subscriptions, pending, sent, failed, dead }
outbound.sign(payload, secret); // HMAC 签名工具
```

## 入站验证器

### 通用 HMAC（不依赖 integration 包）

```typescript
import { createInboundVerifier, createGenericHmacVerifier } from "@ventostack/webhook";

const verifier = createInboundVerifier({
  provider: createGenericHmacVerifier("sha256", "x-signature"),
  config: { secret: "my-secret" },
});

const event = await verifier.verifyAndConvert(rawBody, headers);
// → WebhookEvent { id, type: "webhook.received", source, payload, timestamp }
```

### 使用平台验证器

```typescript
import { createInboundVerifier } from "@ventostack/webhook";
import { createStripeVerifier } from "@ventostack/integration";

const verifier = createInboundVerifier({
  provider: createStripeVerifier(),
  config: { secret: "whsec_..." },
});

// 在 HTTP handler 中使用
app.post("/webhooks/stripe", async (ctx) => {
  const body = await ctx.request.text();
  const headers = Object.fromEntries(ctx.request.headers.entries());
  const event = await verifier.verifyAndConvert(body, headers);
  // event.payload → Stripe 事件数据
  // event.type → "webhook.received" (或 provider 提供的事件类型)
});
```

## 支持的平台

| 平台 | 导入 | 算法 | 特殊说明 |
|------|------|------|---------|
| Stripe | `createStripeVerifier()` | HMAC-SHA256 | 时间戳 + 密钥轮换，5 分钟容差 |
| GitHub | `createGitHubVerifier()` | HMAC-SHA256 | 提取 `X-GitHub-Event` 事件类型 |
| 钉钉 | `createDingTalkVerifier()` | HMAC-SHA256 | 签名在 URL query，通过 `config.extra` 传入 |
| Slack | `createSlackVerifier()` | HMAC-SHA256 | `v0:` 前缀，5 分钟容差 |
| Shopify | `createShopifyVerifier()` | HMAC-SHA256 | Base64 编码 |
| 微信支付 | `createWeChatPayVerifier()` | RSA-SHA256 | 非对称验签，需平台证书公钥 |
| 支付宝 | `createAlipayVerifier()` | RSA2 | 非对称验签，body params 通过 `config.extra.bodyParams` 传入 |

### 平台特殊配置

**钉钉**（签名在 URL query params）：
```typescript
createInboundVerifier({
  provider: createDingTalkVerifier(),
  config: {
    secret: "SEC...",
    extra: { timestamp: "1700000000000", sign: "encoded_sign_here" },
  },
});
```

**微信支付**（支持多证书）：
```typescript
createInboundVerifier({
  provider: createWeChatPayVerifier(),
  config: {
    publicKey: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
    // 多证书场景用 certificates 映射
    extra: {
      certificates: {
        "serial-001": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
      },
    },
  },
});
```

**支付宝**（签名在 body params）：
```typescript
createInboundVerifier({
  provider: createAlipayVerifier(),
  config: {
    publicKey: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
    extra: { bodyParams: parsedBodyParams },
  },
});
```

## EventBus 集成

出站管理器通过 `sendEvent(WebhookEvent)` 与 EventBus 无缝衔接：

```typescript
import { createEventBus, defineEvent } from "@ventostack/events";
import { createOutboundWebhookManager } from "@ventostack/webhook";

const bus = createEventBus();
const outbound = createOutboundWebhookManager();

outbound.subscribe({ url: "...", secret: "...", events: ["order.created"], active: true });

const OrderCreated = defineEvent<{ orderId: string }>("order.created");
bus.on(OrderCreated, async (payload) => {
  await outbound.sendEvent({
    id: crypto.randomUUID(),
    type: "order.created",
    source: "my-app",
    payload,
    timestamp: Date.now(),
  });
});
```
