---
title: 事件溯源
description: 使用 createEventStore 实现 CQRS 和事件溯源架构
---

`createEventStore` 提供了事件溯源（Event Sourcing）的核心功能，将系统状态变更记录为不可变的事件流。

## 基本概念

事件溯源将应用状态建模为一系列事件，而非当前状态快照：

- **聚合根（Aggregate）**：业务实体（如 Order、Account）
- **事件（Event）**：状态变更记录（如 OrderPlaced、PaymentReceived）
- **投影（Projection）**：从事件流重建当前状态

## 基本用法

```typescript
import { createEventStore } from "@aeron/events";

const store = createEventStore({
  adapter: db,  // 使用数据库存储事件
});

// 追加事件
await store.append("order", "order_123", [
  {
    type: "ORDER_PLACED",
    payload: { userId: "user_1", items: [...], total: 199 },
    version: 1,
  }
]);

// 读取事件流
const events = await store.read("order", "order_123");
```

## 定义聚合

```typescript
interface OrderState {
  id: string;
  status: "pending" | "confirmed" | "cancelled";
  total: number;
  items: OrderItem[];
}

// 从事件重建状态
function applyOrderEvent(state: OrderState | null, event: DomainEvent): OrderState {
  switch (event.type) {
    case "ORDER_PLACED":
      return {
        id: event.aggregateId,
        status: "pending",
        total: event.payload.total,
        items: event.payload.items,
      };

    case "ORDER_CONFIRMED":
      return { ...state!, status: "confirmed" };

    case "ORDER_CANCELLED":
      return { ...state!, status: "cancelled" };

    default:
      return state!;
  }
}

// 从事件流重建聚合状态
async function getOrder(orderId: string): Promise<OrderState | null> {
  const events = await store.read("order", orderId);
  if (events.length === 0) return null;
  return events.reduce<OrderState | null>(applyOrderEvent, null);
}
```

## 乐观并发控制

```typescript
// 读取当前版本
const events = await store.read("order", orderId);
const version = events.length;

// 追加时检查版本，防止并发冲突
await store.append("order", orderId, [newEvent], version);
// 如果版本不匹配（被其他操作修改），会抛出 OptimisticLockError
```

## EventStore 接口

```typescript
interface DomainEvent {
  type: string;
  payload: unknown;
  version: number;
  occurredAt?: string;
}

interface EventStore {
  append(
    aggregateType: string,
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion?: number
  ): Promise<void>;
  read(aggregateType: string, aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
}
```
