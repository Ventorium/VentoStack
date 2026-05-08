---
order: 13
title: Redis Session 存储
description: 使用 createRedisSessionStore 实现基于 Redis 的分布式 Session 存储
---

`createRedisSessionStore` 提供了基于 Redis 的 Session 存储实现，支持 TTL 自动过期和按用户 ID 索引，适用于分布式部署场景。实现 `SessionStore` 接口，可直接用于 `createSessionManager`。

## 基本用法

```typescript
import { createSessionManager, createRedisSessionStore } from "@ventostack/auth";
import { createRedisClient } from "@ventostack/cache";

const redis = createRedisClient({ url: "redis://localhost:6379" });
const store = createRedisSessionStore({
  client: redis,
  keyPrefix: "app:session:",
});

const session = createSessionManager(store, { ttl: 3600 });
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `client` | `RedisSessionClientLike` | — | Redis 客户端实例（必填） |
| `keyPrefix` | `string` | `"session:"` | 键前缀，用于命名空间隔离 |

## Redis 客户端接口

`client` 只需实现以下最小接口，兼容 Bun 原生 Redis 客户端：

```typescript
interface RedisSessionClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  sadd?(key: string, ...members: string[]): Promise<number>;
  srem?(key: string, ...members: string[]): Promise<number>;
  smembers?(key: string): Promise<string[]>;
}
```

## 存储结构

| 键模式 | 类型 | 说明 |
|--------|------|------|
| `{prefix}{sessionId}` | String | Session JSON 数据，带 TTL 自动过期 |
| `{prefix}user:{userId}` | Set | 用户关联的所有 Session ID 集合 |

- Session 创建时自动写入用户索引（`sadd`）
- Session 删除时自动清理用户索引（`srem`）
- `deleteByUser` 通过 `smembers` 查找用户所有 Session 后批量删除

## 接口参考

```typescript
interface SessionStore {
  get(id: string): Promise<Session | null>;
  set(session: Session): Promise<void>;
  delete(id: string): Promise<void>;
  touch(id: string, ttl: number): Promise<void>;
  deleteByUser(userId: string): Promise<number>;
}
```

## 注意事项

- `sadd`、`srem`、`smembers` 为可选方法，若客户端未实现则跳过用户索引维护
- Session TTL 根据 `session.expiresAt` 自动计算，已过期的 Session 写入时会直接删除
- 建议设置合理的 `keyPrefix` 以避免多应用共享 Redis 时键冲突
