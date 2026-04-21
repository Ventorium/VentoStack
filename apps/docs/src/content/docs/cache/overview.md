---
title: 缓存层
description: 使用 createCache 添加高性能缓存支持
---

`@aeron/cache` 提供了统一的缓存接口，底层可以切换内存缓存或 Redis，无需修改业务代码。

## 创建缓存

```typescript
import { createCache, createMemoryAdapter } from "@aeron/cache";

const cache = createCache({
  adapter: createMemoryAdapter(),
  ttl: 300,  // 默认 TTL：300 秒
});
```

## 基本操作

```typescript
// 设置缓存（使用默认 TTL）
await cache.set("user:1", { id: 1, name: "Alice" });

// 设置缓存（自定义 TTL，秒）
await cache.set("session:abc", token, 3600);

// 获取缓存
const user = await cache.get<User>("user:1");
if (user) {
  // 命中缓存
} else {
  // 缓存未命中，从数据库加载
}

// 删除缓存
await cache.delete("user:1");

// 检查是否存在
const exists = await cache.has("user:1");

// 清空所有缓存
await cache.clear();
```

## 缓存穿透保护（getOrSet）

```typescript
// 如果缓存命中直接返回，否则执行函数并缓存结果
const user = await cache.getOrSet(
  `user:${id}`,
  async () => {
    return db.from("users").where("id", "=", id).first();
  },
  300  // TTL 秒
);
```

## 在路由中使用

```typescript
router.get("/users/:id", async (ctx) => {
  const { id } = ctx.params;

  const user = await cache.getOrSet(
    `user:${id}`,
    async () => {
      const u = await db.from("users").where("id", "=", id).first();
      if (!u) throw new NotFoundError("用户不存在");
      return u;
    },
    600 // 缓存 10 分钟
  );

  return ctx.json(user);
});

// 更新时使缓存失效
router.put("/users/:id", async (ctx) => {
  const { id } = ctx.params;
  const body = await ctx.body();
  await db.update("users").set(body).where("id", "=", id).execute();
  await cache.delete(`user:${id}`);  // 清除缓存
  return ctx.json({ ok: true });
});
```

## Cache 接口

```typescript
interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
  getOrSet<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T>;
}
```
