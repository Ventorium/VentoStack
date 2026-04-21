---
title: 内存适配器
description: createMemoryAdapter - 用于开发和测试的内存缓存
---

`createMemoryAdapter` 创建一个基于内存的缓存适配器，适合开发环境和测试使用。

## 用法

```typescript
import { createCache, createMemoryAdapter } from "@aeron/cache";

const cache = createCache({
  adapter: createMemoryAdapter(),
  ttl: 300,
});
```

## 特性

- **零依赖**：无需外部服务
- **自动过期**：基于 TTL 自动清理过期条目
- **内存限制**：可配置最大条目数，超出时使用 LRU 策略淘汰
- **快速**：直接内存访问，延迟极低

## 高级配置

```typescript
const adapter = createMemoryAdapter({
  maxSize: 1000,     // 最大缓存条目数
  checkPeriod: 60,   // 过期检查间隔（秒）
});
```

## 注意事项

- 数据存储在进程内存中，进程重启后数据丢失
- 不支持多进程/多实例共享（使用 Redis 适配器替代）
- 适合：本地开发、单元测试、会话存储（单机部署）
