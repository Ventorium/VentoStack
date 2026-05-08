---
order: 1
title: 会话管理
description: 使用 createSessionManager 管理有状态的用户会话
---

`createSessionManager` 提供了服务端会话管理，基于 `SessionStore` 抽象，支持 Session 的创建、查询、更新、销毁与续期能力。内置内存存储实现，支持 TTL 过期检查与键前缀隔离。

## 基本用法

```typescript
import { createSessionManager, createMemorySessionStore } from "@ventostack/auth";

// 内存存储（开发/单进程）
const store = createMemorySessionStore();

const session = createSessionManager(store, {
  ttl: 3600,        // Session 默认 TTL（秒），默认 3600
  prefix: "session:", // 存储键前缀，默认 "session:"
  cookieName: "sid",  // Cookie 名称，默认 "sid"
});
```

## 会话操作

```typescript
// 创建会话 —— 返回 Session 对象 { id, data, expiresAt }
const sess = await session.create({
  userId: user.id,
  role: user.role,
  loginAt: new Date().toISOString(),
});
// sess: { id: "xxx", data: { userId, role, loginAt }, expiresAt: 1234567890000 }

// 读取会话 —— 返回 Session 对象或 null
const existing = await session.get(sess.id);
// existing: { id: "xxx", data: { ... }, expiresAt: 1234567890000 }

// 更新会话（合并更新）
await session.update(sess.id, {
  lastActiveAt: new Date().toISOString(),
});

// 续期 Session（刷新 TTL）
await session.touch(sess.id);

// 销毁会话（登出）
await session.destroy(sess.id);
```

## 在中间件中使用

```typescript
const sessionMiddleware: Middleware = async (ctx, next) => {
  const cookieHeader = ctx.headers.get("cookie");
  const sessionId = parseCookie(cookieHeader)["sid"];

  if (sessionId) {
    const sess = await session.get(sessionId);
    if (sess) {
      ctx.state.session = sess.data;
      ctx.state.sessionId = sessionId;
    }
  }

  await next();

  // 如果会话被修改，刷新过期时间
  if (ctx.state.sessionId) {
    await session.touch(ctx.state.sessionId);
  }
};

// 登录
router.post("/auth/login", async (ctx) => {
  const { email, password } = await ctx.request.json() as { email: string; password: string };
  const user = await authenticateUser(email, password);

  const sess = await session.create({ userId: user.id, role: user.role });

  const response = ctx.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    `sid=${sess.id}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`
  );
  return response;
});

// 登出
router.post("/auth/logout", async (ctx) => {
  const sessionId = ctx.state.sessionId as string;
  if (sessionId) {
    await session.destroy(sessionId);
  }
  const response = ctx.json({ ok: true });
  response.headers.set("Set-Cookie", `sid=; Max-Age=0`);
  return response;
});
```

## Redis 存储

多实例部署时，使用 `createRedisSessionStore` 接入 Redis 实现分布式 Session：

```typescript
import { createSessionManager, createRedisSessionStore } from "@ventostack/auth";
import { createRedisClient } from "@ventostack/cache";

const redis = createRedisClient({ url: "redis://localhost:6379" });
const store = createRedisSessionStore({ client: redis, keyPrefix: "app:session:" });
const session = createSessionManager(store, { ttl: 86400 });
```

## 自定义 SessionStore

你也可以完全自定义存储，只需实现 `SessionStore` 接口：

```typescript
import type { SessionStore, Session } from "@ventostack/auth";

const customStore: SessionStore = {
  async get(id: string): Promise<Session | null> {
    // 从数据库/缓存加载
    return null;
  },

  async set(session: Session): Promise<void> {
    // 持久化到存储
  },

  async delete(id: string): Promise<void> {
    // 删除会话
  },

  async touch(id: string, ttl: number): Promise<void> {
    // 延长过期时间
  },
};

const session = createSessionManager(customStore, { ttl: 86400 });
```

## Session 接口

```typescript
/** Session 数据结构 */
interface Session {
  /** Session 唯一标识 */
  id: string;
  /** Session 关联的用户数据 */
  data: Record<string, unknown>;
  /** Session 过期时间戳（毫秒） */
  expiresAt: number;
}

/** Session 管理器配置选项 */
interface SessionOptions {
  /** Session 默认 TTL（秒），默认 3600 */
  ttl?: number;
  /** 存储键前缀，默认 "session:" */
  prefix?: string;
  /** Cookie 名称，默认 "sid" */
  cookieName?: string;
}

/** Session 存储接口 */
interface SessionStore {
  /**
   * 根据 Session ID 获取 Session
   * @param id Session ID
   * @returns Session 对象，不存在或已过期返回 null
   */
  get(id: string): Promise<Session | null>;

  /**
   * 保存 Session
   * @param session Session 对象
   */
  set(session: Session): Promise<void>;

  /**
   * 删除 Session
   * @param id Session ID
   */
  delete(id: string): Promise<void>;

  /**
   * 延长 Session 过期时间（续期）
   * @param id Session ID
   * @param ttl 续期时长（秒）
   */
  touch(id: string, ttl: number): Promise<void>;
}

/** Session 管理器接口 */
interface SessionManager {
  /**
   * 创建新 Session
   * @param data 可选的初始用户数据
   * @returns 新创建的 Session 对象
   */
  create(data?: Record<string, unknown>): Promise<Session>;

  /**
   * 根据 Session ID 获取 Session
   * @param id Session ID
   * @returns Session 对象，不存在或已过期返回 null
   */
  get(id: string): Promise<Session | null>;

  /**
   * 更新 Session 数据（合并更新）
   * @param id Session ID
   * @param data 要合并的数据
   */
  update(id: string, data: Record<string, unknown>): Promise<void>;

  /**
   * 销毁 Session
   * @param id Session ID
   */
  destroy(id: string): Promise<void>;

  /**
   * 续期 Session 过期时间
   * @param id Session ID
   */
  touch(id: string): Promise<void>;
}
```

## Redis SessionStore 接口

```typescript
/** Redis Session 存储客户端最小接口 */
interface RedisSessionClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  /** 向集合添加成员（可选，用于 userId→sessionId 索引） */
  sadd?(key: string, ...members: string[]): Promise<number>;
  /** 从集合移除成员（可选） */
  srem?(key: string, ...members: string[]): Promise<number>;
  /** 获取集合所有成员（可选） */
  smembers?(key: string): Promise<string[]>;
}

/** Redis Session 存储选项 */
interface RedisSessionStoreOptions {
  client: RedisSessionClientLike;
  keyPrefix?: string;
}

/** 创建 Redis Session 存储 */
function createRedisSessionStore(options: RedisSessionStoreOptions): SessionStore;
```

## 注意事项

- `createSessionManager(store, options)` 的第一个参数是 `SessionStore` 实例，不是配置对象
- `create()` 返回 `Promise<Session>` 对象，包含 `id`、`data`、`expiresAt`，不是字符串
- `get()` 返回 `Promise<Session | null>`，不是 `Record | null`
- 续期方法名为 `touch(id)`，不是 `refresh()`
- `cookieName` 配置项当前仅在接口中保留，实际 Cookie 名称需要开发者在中间件中自行处理（如示例中的 `"sid"`）
- 内置 `createMemorySessionStore()` 基于 Map 实现，仅适合开发或单进程场景
