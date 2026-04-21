---
title: 消息队列
description: 使用 createMemoryMQAdapter 和 createMQAdapterFactory 集成消息队列
---

`@aeron/events` 提供了消息队列适配器接口，内置内存实现，可扩展接入 Kafka、RabbitMQ、NATS 等。

## 内存消息队列（开发/测试）

```typescript
import { createMemoryMQAdapter } from "@aeron/events";

const mq = createMemoryMQAdapter();

// 发布消息
await mq.publish("orders", {
  id: "order_123",
  type: "ORDER_PLACED",
  payload: { orderId: "order_123", userId: "user_1" },
  timestamp: new Date().toISOString(),
});

// 订阅主题
await mq.subscribe("orders", async (message) => {
  console.log("收到消息:", message.payload);
  // 处理消息...
});
```

## 自定义适配器（生产环境）

使用 `createMQAdapterFactory` 注册自定义实现：

```typescript
import { createMQAdapterFactory } from "@aeron/events";
import type { MQAdapter, MQAdapterConfig, MQMessage } from "@aeron/events";

// 实现 Kafka 适配器
function createKafkaAdapter(config: MQAdapterConfig): MQAdapter {
  const kafka = new KafkaClient(config);

  return {
    async publish(topic: string, message: MQMessage): Promise<void> {
      await kafka.send({
        topic,
        messages: [{ value: JSON.stringify(message) }],
      });
    },

    async subscribe(topic: string, handler: (msg: MQMessage) => Promise<void>): Promise<void> {
      const consumer = kafka.consumer();
      await consumer.subscribe({ topic });
      await consumer.run({
        eachMessage: async ({ message }) => {
          const msg = JSON.parse(message.value!.toString());
          await handler(msg);
        },
      });
    },

    async close(): Promise<void> {
      await kafka.disconnect();
    },
  };
}

// 注册适配器
const factory = createMQAdapterFactory();
factory.register("kafka", createKafkaAdapter);

// 创建适配器实例
const mq = factory.create({
  type: "kafka",
  brokers: ["localhost:9092"],
});
```

## 消息格式

```typescript
interface MQMessage {
  id?: string;
  type: string;
  payload: unknown;
  timestamp: string;
  headers?: Record<string, string>;
}
```

## MQAdapter 接口

```typescript
interface MQAdapter {
  publish(topic: string, message: MQMessage): Promise<void>;
  subscribe(topic: string, handler: MQMessageHandler): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  close(): Promise<void>;
}

type MQMessageHandler = (message: MQMessage) => Promise<void>;
```
