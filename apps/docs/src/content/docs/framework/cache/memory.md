---
order: 2
title: 内存适配器
description: createMemoryAdapter - 用于开发和测试的内存缓存
---

`createMemoryAdapter` 创建一个基于内存的缓存适配器，适合开发环境和测试使用。

## 用法

```typescript
import { createCache, createMemoryAdapter } from "@ventostack/cache";

const cache = createCache(createMemoryAdapter());
```

## 特性

- **零依赖**：无需外部服务
- **自动过期**：基于 TTL 自动清理过期条目
- **模式匹配**：支持通配符 `*` 的键列表查询
- **快速**：直接内存访问，延迟极低

## 接口

```typescript
interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  flush(): Promise<void>;
  keys(pattern: string): Promise<string[]>;
}
```

## 注意事项

- 数据存储在进程内存中，进程重启后数据丢失
- 不支持多进程/多实例共享（使用 Redis 适配器替代）
- 适合：本地开发、单元测试、会话存储（单机部署）
