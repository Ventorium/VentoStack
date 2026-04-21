---
title: 会话管理
description: 使用 createSessionManager 管理有状态的用户会话
---

`createSessionManager` 提供了服务端会话管理，支持内存和 Redis 存储后端。

## 基本用法

```typescript
import { createSessionManager } from "@aeron/auth";
import { createRedisAdapter } from "@aeron/cache";

const session = createSessionManager({
  adapter: createRedisAdapter({ url: process.env.REDIS_URL! }),
  ttl: 86400,         // 会话有效期：24小时
  cookieName: "sid",  // Cookie 名称
  secret: process.env.SESSION_SECRET!,
});
```

## 会话操作

```typescript
// 创建会话
const sessionId = await session.create({
  userId: user.id,
  role: user.role,
  loginAt: new Date().toISOString(),
});

// 读取会话
const data = await session.get(sessionId);

// 更新会话
await session.update(sessionId, {
  ...data,
  lastActiveAt: new Date().toISOString(),
});

// 销毁会话（登出）
await session.destroy(sessionId);
```

## 在中间件中使用

```typescript
const sessionMiddleware: Middleware = async (ctx, next) => {
  const cookieHeader = ctx.headers.get("cookie");
  const sessionId = parseCookie(cookieHeader)[session.cookieName];

  if (sessionId) {
    const data = await session.get(sessionId);
    if (data) {
      ctx.state.session = data;
      ctx.state.sessionId = sessionId;
    }
  }

  await next();

  // 如果会话被修改，刷新过期时间
  if (ctx.state.sessionId) {
    await session.refresh(ctx.state.sessionId);
  }
};

// 登录
router.post("/auth/login", async (ctx) => {
  const { email, password } = await ctx.body();
  const user = await authenticateUser(email, password);

  const sessionId = await session.create({ userId: user.id, role: user.role });

  const response = ctx.json({ ok: true });
  response.headers.set(
    "Set-Cookie",
    `${session.cookieName}=${sessionId}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
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
  response.headers.set("Set-Cookie", `${session.cookieName}=; Max-Age=0`);
  return response;
});
```

## SessionManager 接口

```typescript
interface SessionManager {
  create(data: Record<string, unknown>): Promise<string>;
  get(sessionId: string): Promise<Record<string, unknown> | null>;
  update(sessionId: string, data: Record<string, unknown>): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  refresh(sessionId: string): Promise<void>;
  cookieName: string;
}
```
