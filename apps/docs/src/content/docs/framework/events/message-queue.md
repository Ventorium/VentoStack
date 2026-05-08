---
order: 4
title: 消息队列
description: 使用 createMemoryQueue 和 MQ 适配器集成消息队列
---

`@ventostack/events` 提供了内存消息队列与 MQ 适配器接口，可扩展接入外部 MQ 系统。

## 内存消息队列（开发/测试）

```typescript
import { createMemoryQueue } from "@ventostack/events";

const mq = createMemoryQueue();

// 发布消息
const messageId = await mq.publish("orders", {
  orderId: "order_123",
  userId: "user_1",
  total: 199,
});

// 订阅主题
const unsubscribe = mq.subscribe("orders", async (message) => {
  console.log("收到消息:", message.payload);
  // 处理消息...
});

// 取消订阅
unsubscribe();

// 获取待处理消息数
const pendingCount = mq.pending("orders");
```

## 队列配置选项

订阅时可配置重试、并发等参数：

```typescript
mq.subscribe("orders", async (message) => {
  await processOrder(message.payload);
}, {
  maxRetries: 3,      // 失败时最大重试次数，默认 3
  retryDelay: 1000,   // 重试间隔（毫秒），默认 1000
  concurrency: 1,     // 最大并发处理数，默认 1
});
```

## MQ 适配器接口

使用 `createMemoryMQAdapter` 和 `createMQAdapterFactory` 接入统一 MQ 抽象：

```typescript
import { createMemoryMQAdapter, createMQAdapterFactory } from "@ventostack/events";
import type { MQAdapter, MQAdapterConfig, MQMessage } from "@ventostack/events";

// 内存适配器（开发/测试）
const adapter = createMemoryMQAdapter();
await adapter.connect();

await adapter.publish("orders", {
  body: { orderId: "order_123", userId: "user_1" },
  headers: { "x-source": "api" },
});

const unsubscribe = await adapter.subscribe("orders", async (message) => {
  console.log("收到:", message.body);
});

// 断开连接
await adapter.disconnect();
```

## 自定义适配器（生产环境）

使用 `createMQAdapterFactory` 注册自定义实现：

```typescript
const factory = createMQAdapterFactory();

// 注册 Kafka 适配器
factory.register("kafka", (config: MQAdapterConfig) => {
  // 返回自定义 MQAdapter 实现
  return {
    name: "kafka",
    async connect() { /* ... */ },
    async disconnect() { /* ... */ },
    async publish(topic, message) { /* ... */ },
    async subscribe(topic, handler) { /* ... */ return () => {}; },
    isConnected() { return true; },
  };
});

// 创建适配器实例
const mq = factory.create({ type: "kafka", url: "localhost:9092" });
```

## 消息格式

```typescript
interface MQMessage {
  id?: string;
  body: unknown;
  headers?: Record<string, string>;
  timestamp?: number;
}
```

## MQAdapter 接口

```typescript
interface MQAdapter {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, message: MQMessage): Promise<void>;
  subscribe(topic: string, handler: MQMessageHandler): Promise<() => void>;
  isConnected(): boolean;
}

type MQMessageHandler = (message: MQMessage) => Promise<void>;
```

## MessageQueue 接口

```typescript
interface MessageQueue {
  publish<T>(topic: string, payload: T, headers?: Record<string, string>): Promise<string>;
  subscribe<T>(topic: string, handler: MessageHandler<T>, options?: QueueOptions): () => void;
  unsubscribe(topic: string): void;
  pending(topic: string): number;
}

interface QueueOptions {
  maxRetries?: number;
  retryDelay?: number;
  concurrency?: number;
}
```
