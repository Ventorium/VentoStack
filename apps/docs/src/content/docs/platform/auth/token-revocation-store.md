---
order: 14
title: Token 吊销存储
description: 使用 createMemoryRevocationStore 和 createRedisRevocationStore 实现 Token 吊销状态管理
---

Token 吊销存储提供了 Token 黑名单（吊销列表）的抽象接口与两种实现。当需要使已签发的 JWT 失效时（如用户登出、密码修改），可将 Token JTI 加入吊销列表。

## 内存实现

适用于开发环境或单实例部署，基于 `Map` 存储，支持 TTL 过期检查与懒清理。

```typescript
import { createMemoryRevocationStore } from "@ventostack/auth";

const store = createMemoryRevocationStore();

// 吊销 Token（ttl 单位为毫秒）
await store.add("token-jti-123", 3600_000);

// 检查是否已吊销
const revoked = await store.has("token-jti-123"); // true
const notRevoked = await store.has("other-jti");  // false
```

## Redis 实现

适用于生产环境与分布式部署，基于 Redis SET + `PEXPIRE` 实现 TTL 自动过期。

```typescript
import { createRedisRevocationStore } from "@ventostack/auth";
import { createRedisClient } from "@ventostack/cache";

const redis = createRedisClient({ url: "redis://localhost:6379" });
const store = createRedisRevocationStore(redis, "revocation:");

// 吊销 Token
await store.add("token-jti-123", 3600_000);

// 检查是否已吊销
const revoked = await store.has("token-jti-123"); // true
```

## 配置

### `createMemoryRevocationStore()`

无参数。

### `createRedisRevocationStore(client, prefix?)`

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `client` | `RedisRevocationClientLike` | — | Redis 客户端实例（必填） |
| `prefix` | `string` | `"token_revocation:"` | 键前缀 |

## Redis 客户端接口

```typescript
interface RedisRevocationClientLike {
  set(key: string, value: string): Promise<unknown>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  exists(key: string): Promise<boolean>;
}
```

## 接口参考

```typescript
interface TokenRevocationStore {
  add(jti: string, ttl: number): Promise<void>;
  has(jti: string): Promise<boolean>;
}
```

## 在认证流程中使用

```typescript
// 登出时吊销当前 Token
const payload = jwt.verify(accessToken, secret);
await revocationStore.add(payload.jti, payload.exp * 1000 - Date.now());

// 请求鉴权时检查吊销状态
if (await revocationStore.has(payload.jti)) {
  throw new UnauthorizedError("Token 已被吊销");
}
```

## 注意事项

- 内存实现会在 `has()` 调用时懒清理过期条目，不会主动回收
- Redis 实现使用毫秒级 TTL（`PEXPIRE`），Token 过期后自动删除，无需手动清理
- `ttl` 参数建议设置为 Token 剩余有效时间，避免吊销列表无限增长
