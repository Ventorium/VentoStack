---
order: 1
title: 事件总线
description: 使用 createEventBus 和 defineEvent 实现类型安全的事件驱动架构
---

`@ventostack/events` 提供了类型安全的事件总线，支持同步和异步事件处理、有序执行与快照迭代保护。

## 定义事件

使用 `defineEvent` 定义带有类型约束的事件：

```typescript
import { defineEvent } from "@ventostack/events";

// 定义事件类型
const UserRegistered = defineEvent<{
  userId: string;
  email: string;
  registeredAt: Date;
}>("user.registered");

const OrderPlaced = defineEvent<{
  orderId: string;
  userId: string;
  total: number;
  items: Array<{ productId: string; quantity: number }>;
}>("order.placed");

const PaymentFailed = defineEvent<{
  orderId: string;
  reason: string;
}>("payment.failed");
```

## 创建事件总线

```typescript
import { createEventBus } from "@ventostack/events";

const bus = createEventBus();
```

## 发布事件

```typescript
// 触发事件（TypeScript 会推断 payload 类型）
await bus.emit(UserRegistered, {
  userId: "user_123",
  email: "alice@example.com",
  registeredAt: new Date(),
});
```

## 订阅事件

```typescript
// 订阅事件（handler 的参数类型自动推断）
bus.on(UserRegistered, async (payload) => {
  // payload.userId, payload.email, payload.registeredAt 都有类型
  await sendWelcomeEmail(payload.email);
  console.log(`新用户注册: ${payload.email}`);
});

// 多个订阅者
bus.on(UserRegistered, async (payload) => {
  await analytics.track("user_registered", { userId: payload.userId });
});

bus.on(OrderPlaced, async (payload) => {
  await inventory.reserve(payload.items);
  await notification.send(payload.userId, "订单已确认");
});
```

## 在路由中使用

```typescript
const bus = createEventBus();

// 注册订阅（应用启动时）
bus.on(UserRegistered, async (payload) => {
  await emailService.sendWelcome(payload.email);
});

bus.on(OrderPlaced, async (payload) => {
  await fulfillmentService.process(payload.orderId);
});

// 在路由处理程序中发布
router.post("/users", async (ctx) => {
  const body = await ctx.request.json();
  const user = await createUser(body);

  // 发布事件，异步处理不阻塞响应
  await bus.emit(UserRegistered, {
    userId: user.id,
    email: user.email,
    registeredAt: new Date(),
  });

  return ctx.json(user, 201);
});
```

## 取消订阅

```typescript
const unsubscribe = bus.on(UserRegistered, handler);

// 之后取消订阅
unsubscribe();
```

## 一次性订阅

```typescript
// 只处理一次事件
bus.once(UserRegistered, async (payload) => {
  console.log("第一个用户注册:", payload.email);
});
```

## 移除事件处理器

```typescript
// 移除指定事件的某个处理器
bus.off(UserRegistered, handler);

// 移除指定事件的所有处理器
bus.off(UserRegistered);

// 移除所有事件的所有处理器
bus.removeAll();
```

## 获取监听器数量

```typescript
const count = bus.listenerCount(UserRegistered);
console.log(`user.registered 有 ${count} 个处理器`);
```

## EventBus 接口

```typescript
interface EventBus {
  on<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void;
  once<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void;
  emit<T>(event: EventDefinition<T>, payload: T): Promise<void>;
  off<T>(event: EventDefinition<T>, handler?: EventHandler<T>): void;
  removeAll(): void;
  listenerCount(event: EventDefinition<unknown>): number;
}
```
