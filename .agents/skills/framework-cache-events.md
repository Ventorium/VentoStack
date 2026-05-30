---
name: framework-cache-events
description: |
  开发或修改 @ventostack/cache 和 @ventostack/events 框架层代码时必须遵循的规范。
---

# Framework Cache & Events — AI Agent 编码规范

## Cache

### 核心原则

1. **统一接口**: `Cache` 接口屏蔽 Redis / 内存适配器差异。
2. **多级缓存**: L1（内存）+ L2（Redis），L1 必须有 TTL 和容量上限。
3. **防雪崩**: 随机 TTL 抖动（jitter）。
4. **防穿透**: singleflight + 空值缓存。
5. **分布式锁**: 基于 Redis `SET NX EX`，必须有超时释放。

### 缓存 key 规范

```typescript
// ✅ 正确: 包含租户 namespace
const key = `cache:${tenantId}:user:${userId}`;

// ❌ 禁止: 无 namespace
const key = `user:${userId}`;
```

### 使用模板

```typescript
import { createCache, createRedisAdapter, createMemoryAdapter } from "@ventostack/cache";

const cache = createCache({
  adapter: createRedisAdapter({ url: env.REDIS_URL }),
  defaultTTL: 300,
  jitter: true,
});

// 读
const value = await cache.get(`user:${id}`);

// 写
await cache.set(`user:${id}`, value, { ttl: 600 });

// 标签失效
await cache.invalidateTag("users");
```

## Events

### 核心原则

1. **事件总线**: 支持同步 / 异步分发。
2. **领域事件**: 用 `defineEvent` 定义，包含 `type` + `payload` + `metadata`。
3. **可靠投递**: 持久化 + ACK + 死信队列。
4. **幂等性**: 消费者必须实现幂等（`idempotencyKey`）。

### 事件定义

```typescript
// ✅ 正确
import { defineEvent } from "@ventostack/events";

export const UserCreatedEvent = defineEvent("user.created", {
  schema: z.object({ userId: z.string(), email: z.string().email() }),
});
```

### 监听器

```typescript
// ✅ 正确
eventBus.on(UserCreatedEvent, async (event) => {
  // 幂等处理
  await sendWelcomeEmail(event.payload.email);
});
```

### 调度器

```typescript
// ✅ 正确
import { createScheduler } from "@ventostack/events";

const scheduler = createScheduler();

scheduler.schedule("0 0 * * *", {
  name: "daily-cleanup",
  handler: async () => { ... },
  timeout: 300_000,
  retry: 3,
});
```

### 约束

- 任务必须有 `name`、`handler`、`timeout`
- 分布式调度必须有锁（`lockKey`）
- 优雅停止时，正在执行的任务不被强杀
- Hook: `onBeforeExecute` / `onAfterExecute` / `onError`
