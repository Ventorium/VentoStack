---
title: Redis 适配器
description: createRedisAdapter - 用于生产环境的 Redis 缓存
---

`createRedisAdapter` 创建基于 Redis 的缓存适配器，适合生产环境和多实例部署。

## 安装

Redis 适配器需要 Redis 服务运行。无需额外安装 npm 包，Aeron 使用原生协议连接：

```bash
# macOS
brew install redis && brew services start redis

# Docker
docker run -d -p 6379:6379 redis:latest
```

## 用法

```typescript
import { createCache, createRedisAdapter } from "@aeron/cache";

const cache = createCache({
  adapter: createRedisAdapter({
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  }),
  ttl: 300,
});
```

## 高级配置

```typescript
const adapter = createRedisAdapter({
  url: "redis://localhost:6379",
  keyPrefix: "myapp:",     // 键前缀，避免键冲突
  maxRetries: 3,           // 连接重试次数
  connectTimeout: 5000,    // 连接超时（ms）
});
```

## 键前缀

在共享 Redis 实例上部署多个服务时，使用键前缀隔离：

```typescript
// 服务 A
const cacheA = createCache({
  adapter: createRedisAdapter({ url: REDIS_URL, keyPrefix: "service-a:" }),
});

// 服务 B
const cacheB = createCache({
  adapter: createRedisAdapter({ url: REDIS_URL, keyPrefix: "service-b:" }),
});
```

## 环境变量配置

推荐使用环境变量管理连接信息：

```bash
# .env
REDIS_URL=redis://user:password@redis.example.com:6379/0
```

```typescript
const cache = createCache({
  adapter: createRedisAdapter({ url: process.env.REDIS_URL! }),
  ttl: 600,
});
```

## 关闭连接

```typescript
const adapter = createRedisAdapter({ url: REDIS_URL });
const cache = createCache({ adapter });

app.onStop(async () => {
  await adapter.close();
});
```
