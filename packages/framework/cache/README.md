# @ventostack/cache

VentoStack 的统一缓存基础设施，为业务模块提供一致、可替换且便于测试的缓存接口。

## 核心能力

- 统一的 `Cache`、`CacheAdapter` 与标签缓存接口
- Bun Redis 客户端及 Redis 缓存适配器
- 适用于开发和测试的内存适配器
- L1/L2 两级缓存组合
- 分布式锁与缓存击穿保护
- TTL 抖动，降低缓存集中失效风险
- `remember`、批量标签失效等常用缓存策略

## 使用边界

本包只负责缓存机制，不包含业务 key 设计。平台模块应为缓存 key 添加租户和资源命名空间。

```ts
import { createCache, createMemoryAdapter } from "@ventostack/cache";

const cache = createCache(createMemoryAdapter());
await cache.set("example:key", { enabled: true }, { ttl: 60 });
```
