---
order: 3
title: Redis 适配器
description: 基于 Redis 的持久化缓存适配器
---

`createRedisAdapter` 实现了 `CacheAdapter` 接口，将缓存操作代理到 Redis，支持 TTL、键前缀与多种 Redis 客户端兼容。

## 基本用法

```typescript
import { createCache, createRedisAdapter, createRedisClient } from "@ventostack/cache";

// 使用 Bun 原生 Redis
const redis = createRedisClient({ url: "redis://localhost:6379" });
const cache = createCache(createRedisAdapter({ client: redis }));
```

## 键前缀

通过 `keyPrefix` 为所有缓存键添加前缀，实现多应用隔离：

```typescript
const cache = createCache(
  createRedisAdapter({ client: redis, keyPrefix: "app:v1:" })
);

await cache.set("user:1", { name: "Alice" });
// Redis 中实际存储键为 "app:v1:user:1"
```

## 接口定义

```typescript
/** Redis 缓存客户端最小接口 */
interface RedisCacheClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<boolean>;
  keys(pattern: string): Promise<string[]>;
  send(command: string, args: string[]): Promise<unknown>;
}

/** Redis 适配器选项 */
interface RedisAdapterOptions {
  /** Redis 客户端实例 */
  client: RedisCacheClientLike;
  /** 键前缀，默认 "" */
  keyPrefix?: string;
}

/** 创建 Redis 缓存适配器 */
function createRedisAdapter(options: RedisAdapterOptions): CacheAdapter;
```

## 注意事项

- `createRedisAdapter` 使用 `set` + `expire` 两步设置 TTL，最大化兼容不同客户端。
- `flush()` 通过 `send("FLUSHDB", [])` 清空当前 Redis 数据库，生产环境请谨慎使用。
- `keys()` 依赖 Redis 的 `KEYS` 命令，在大量键场景下建议使用 `SCAN` 替代（可通过自定义适配器实现）。
- 键前缀在 `keys()` 返回结果中会被自动去除，保持与无前缀模式一致的开发体验。
