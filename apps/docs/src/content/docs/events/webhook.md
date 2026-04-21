---
title: Webhook
description: 使用 createWebhookManager 向外部系统发送 Webhook 通知
---

`createWebhookManager` 提供了 Webhook 的注册、签名验证和自动重试功能。

## 基本用法

```typescript
import { createWebhookManager } from "@aeron/events";

const webhooks = createWebhookManager({
  secret: process.env.WEBHOOK_SECRET!,
  retries: 3,           // 失败后重试次数
  retryDelay: 1000,     // 重试间隔（ms）
  timeout: 10_000,      // 请求超时（ms）
});
```

## 注册 Webhook

```typescript
// 用户通过 API 注册 Webhook
router.post("/webhooks", authMiddleware, async (ctx) => {
  const { url, events } = await ctx.body<{ url: string; events: string[] }>();
  const userId = ctx.state.user.sub;

  await db.insert("webhooks", {
    user_id: userId,
    url,
    events: JSON.stringify(events),
    secret: generateWebhookSecret(),
  }).execute();

  return ctx.json({ registered: true }, 201);
});
```

## 触发 Webhook

```typescript
// 当有事件发生时触发所有订阅了该事件的 Webhook
async function triggerWebhooks(eventType: string, payload: unknown) {
  const subscribers = await db.from("webhooks")
    .whereRaw("events::jsonb @> $1", [JSON.stringify([eventType])])
    .execute();

  await Promise.allSettled(
    subscribers.map(sub =>
      webhooks.send(sub.url, {
        event: eventType,
        payload,
        timestamp: new Date().toISOString(),
      }, sub.secret)
    )
  );
}

// 订单创建后触发
router.post("/orders", async (ctx) => {
  const order = await createOrder(await ctx.body());
  await triggerWebhooks("order.created", order);
  return ctx.json(order, 201);
});
```

## 接收并验证 Webhook

验证来自外部系统的 Webhook 签名：

```typescript
router.post("/webhooks/github", async (ctx) => {
  const signature = ctx.headers.get("x-hub-signature-256")!;
  const body = await ctx.request.text();

  const valid = webhooks.verify(body, signature, process.env.GITHUB_WEBHOOK_SECRET!);
  if (!valid) {
    return ctx.json({ error: "Invalid signature" }, 401);
  }

  const event = JSON.parse(body);
  // 处理 GitHub 事件...
  return ctx.json({ received: true });
});
```

## WebhookManager 接口

```typescript
interface WebhookPayload {
  event: string;
  payload: unknown;
  timestamp: string;
}

interface WebhookManager {
  send(url: string, payload: WebhookPayload, secret?: string): Promise<void>;
  verify(body: string, signature: string, secret: string): boolean;
  sign(body: string, secret: string): string;
}
```
