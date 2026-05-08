---
order: 1
title: 缓存层
description: 使用 createCache 添加高性能缓存支持
---

`@ventostack/cache` 提供了统一的缓存接口，内置内存与 Redis 两种适配器。所有组件基于 `CacheAdapter` 接口构建，切换底层存储无需修改业务代码。

## 创建缓存

### 内存缓存（开发/单进程）

```typescript
import { createCache, createMemoryAdapter } from "@ventostack/cache";

const cache = createCache(createMemoryAdapter());
```

### Redis 缓存（生产/分布式）

```typescript
import { createCache, createRedisAdapter, createRedisClient } from "@ventostack/cache";

const redis = createRedisClient({ url: "redis://localhost:6379" });
const cache = createCache(
  createRedisAdapter({ client: redis, keyPrefix: "app:v1:" })
);
```

## 基本操作

```typescript
// 设置缓存（无 TTL，永久有效）
await cache.set("user:1", { id: 1, name: "Alice" });

// 设置缓存（自定义 TTL，秒）
await cache.set("session:abc", token, { ttl: 3600 });

// 获取缓存
const user = await cache.get<User>("user:1");
if (user) {
  // 命中缓存
} else {
  // 缓存未命中，从数据库加载
}

// 删除缓存
await cache.del("user:1");

// 检查是否存在
const exists = await cache.has("user:1");

// 清空所有缓存
await cache.flush();
```

## 标签缓存

```typescript
// 获取带标签的缓存视图
const tagged = cache.tags(["users", "active"]);

// 设置缓存并自动关联到标签
await tagged.set("user:1", { id: 1, name: "Alice" }, { ttl: 300 });

// 清除该标签关联的所有缓存键
await tagged.flush();
```

## 缓存穿透保护（remember）

```typescript
// 如果缓存命中直接返回，否则执行函数并缓存结果
const user = await cache.remember(
  `user:${id}`,
  300,  // TTL 秒
  async () => {
    return db.query(UserModel).where("id", "=", id).get();
  }
);
```

## 缓存击穿防护（singleflight）

```typescript
// 对同一 key 的并发请求只执行一次工厂函数
const user = await cache.singleflight(
  `user:${id}`,
  async () => {
    return db.query(UserModel).where("id", "=", id).get();
  }
);
```

## 在路由中使用

```typescript
router.get("/users/:id", async (ctx) => {
  const { id } = ctx.params;

  const user = await cache.remember(
    `user:${id}`,
    600, // 缓存 10 分钟
    async () => {
      const u = await db.query(UserModel).where("id", "=", id).get();
      if (!u) throw new NotFoundError("用户不存在");
      return u;
    }
  );

  return ctx.json(user);
});

// 更新时使缓存失效
router.put("/users/:id", async (ctx) => {
  const { id } = ctx.params;
  const body = await ctx.request.json();
  await db.query(UserModel).where("id", "=", id).update(body);
  await cache.del(`user:${id}`);  // 清除缓存
  return ctx.json({ ok: true });
});
```

## Cache 接口

```typescript
interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: { ttl?: number; tags?: string[] }): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  flush(): Promise<void>;
  tags(tagNames: string[]): TaggedCache;
  remember<T>(key: string, ttl: number, factory: () => Promise<T>): Promise<T>;
  singleflight<T>(key: string, factory: () => Promise<T>): Promise<T>;
}

interface TaggedCache {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: Omit<CacheOptions, "tags">): Promise<void>;
  flush(): Promise<void>;
}
```

## 其他缓存工具

`@ventostack/cache` 还提供了以下独立工具：

- **`createLock(adapter)`** — 基于缓存适配器的分布式锁
- **`createL2Cache(l2Adapter, options?)`** — 本地 L1 + 远端 L2 二级缓存
- **`createStampedeProtection(getter, setter, options?)`** — 缓存击穿/雪崩防护（singleflight + XFetch）
- **`jitterTTL(baseTTL, jitterPercent?)`** / **`withJitter(adapter, options?)`** — TTL 抖动防雪崩
