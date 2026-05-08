/**
 * @ventostack/cache - 缓存模块统一导出
 *
 * 提供 VentoStack 框架的缓存基础设施，包括：
 * - 统一缓存接口与工厂（createCache）
 * - 内存缓存适配器（createMemoryAdapter）
 * - 分布式锁（createLock）
 * - TTL 抖动防雪崩（jitterTTL / withJitter）
 * - 二级缓存 L1 + L2（createL2Cache）
 * - 缓存击穿/雪崩防护（createStampedeProtection）
 *
 * 所有组件基于 CacheAdapter 接口构建，支持内存、Redis 等多种底层存储。
 */

// 核心缓存接口与工厂
export { createCache } from "./cache";
export type { Cache, CacheOptions, CacheAdapter, TaggedCache } from "./cache";

// 内存缓存适配器
export { createMemoryAdapter } from "./memory-adapter";

// Redis 缓存适配器
export { createRedisAdapter } from "./redis-adapter";
export type { RedisCacheClientLike, RedisAdapterOptions } from "./redis-adapter";

// 分布式锁
export { createLock } from "./lock";
export type { Lock, LockOptions } from "./lock";

// TTL 抖动（防缓存雪崩）
export { jitterTTL, withJitter } from "./jitter";
export type { JitterCacheOptions } from "./jitter";

// 二级缓存（L1 + L2）
export { createL2Cache } from "./l2-cache";
export type { L2Cache, L2CacheOptions } from "./l2-cache";

// 缓存击穿/雪崩防护（singleflight / XFetch）
export { createStampedeProtection } from "./stampede";
export type { StampedeProtection, StampedeProtectionOptions } from "./stampede";

// Redis 客户端工厂
export { createRedisClient } from "./redis-client";
export type { RedisClientOptions, RedisClientInstance } from "./redis-client";
