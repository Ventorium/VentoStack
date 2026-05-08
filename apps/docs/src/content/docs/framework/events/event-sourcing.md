---
order: 5
title: 事件溯源
description: 使用 createMemoryEventStore 实现事件溯源架构
---

`@ventostack/events` 提供了内存事件溯源存储，支持乐观并发控制与快照机制。

## 基本概念

事件溯源将应用状态建模为一系列事件，而非当前状态快照：

- **聚合根（Aggregate）**：业务实体（如 Order、Account）
- **事件（Event）**：状态变更记录（如 OrderPlaced、PaymentReceived）
- **投影（Projection）**：从事件流重建当前状态

## 基本用法

```typescript
import { createMemoryEventStore } from "@ventostack/events";

const store = createMemoryEventStore();

// 追加事件（expectedVersion 用于乐观并发控制）
const stored = await store.append(
  "order_123",
  "order",
  [
    {
      eventType: "ORDER_PLACED",
      payload: { userId: "user_1", items: [...], total: 199 },
    },
  ],
  0, // 期望当前版本为 0
);

// 读取事件流
const events = await store.getEvents("order_123");

// 获取最新版本号
const version = await store.getLatestVersion("order_123");
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
function applyOrderEvent(state: OrderState | null, event: StoredEvent): OrderState | null {
  switch (event.eventType) {
    case "ORDER_PLACED":
      return {
        id: event.aggregateId,
        status: "pending",
        total: (event.payload as any).total,
        items: (event.payload as any).items,
      };

    case "ORDER_CONFIRMED":
      return state ? { ...state, status: "confirmed" } : state;

    case "ORDER_CANCELLED":
      return state ? { ...state, status: "cancelled" } : state;

    default:
      return state;
  }
}

// 从事件流重建聚合状态
async function getOrder(orderId: string): Promise<OrderState | null> {
  const events = await store.getEvents(orderId);
  if (events.length === 0) return null;
  return events.reduce<OrderState | null>(applyOrderEvent, null);
}
```

## 乐观并发控制

```typescript
// 读取当前版本
const version = await store.getLatestVersion(orderId);

// 追加时检查版本，防止并发冲突
await store.append(orderId, "order", [newEvent], version);
// 如果版本不匹配（被其他操作修改），会抛出 Error
```

## 快照

```typescript
// 保存聚合根快照
await store.saveSnapshot(orderId, currentState, currentVersion);

// 获取聚合根快照
const snapshot = await store.getSnapshot(orderId);
if (snapshot) {
  // 从快照版本之后的事件继续重建
  const events = await store.getEvents(orderId, snapshot.version + 1);
  const state = events.reduce(applyOrderEvent, snapshot.state as OrderState);
}
```

## EventStore 接口

```typescript
interface StoredEvent<T = unknown> {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: T;
  version: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface EventStore {
  append(
    aggregateId: string,
    aggregateType: string,
    events: Array<{ eventType: string; payload: unknown; metadata?: Record<string, unknown> }>,
    expectedVersion: number,
  ): Promise<StoredEvent[]>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<StoredEvent[]>;
  getLatestVersion(aggregateId: string): Promise<number>;
  saveSnapshot(aggregateId: string, state: unknown, version: number): Promise<void>;
  getSnapshot(aggregateId: string): Promise<{ state: unknown; version: number } | null>;
}
```

## 注意事项

- `createMemoryEventStore` 基于内存 Map 实现，进程重启后数据丢失
- 生产环境需要自行实现持久化存储适配器（基于数据库或事件存储系统）
- 乐观并发控制通过 `expectedVersion` 参数实现，版本冲突时抛出 `Error`
