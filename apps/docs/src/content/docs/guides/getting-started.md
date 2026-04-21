---
title: 快速开始
description: 5 分钟内创建并运行你的第一个 Aeron 应用
---

## 前置条件

安装 [Bun](https://bun.sh)（>= 1.0.0）：

```bash
curl -fsSL https://bun.sh/install | bash
```

## 创建项目

```bash
mkdir my-aeron-app
cd my-aeron-app
bun init -y
```

## 安装依赖

```bash
bun add @aeron/core
```

## 创建应用

创建 `src/main.ts`：

```typescript
import { createApp, createRouter } from "@aeron/core";

const router = createRouter();

router.get("/", async (ctx) => {
  return ctx.json({ message: "Hello, Aeron!" });
});

router.get("/users/:id", async (ctx) => {
  const { id } = ctx.params;
  return ctx.json({ id, name: "Alice" });
});

const app = createApp({ port: 3000 });
app.use(router.middleware());
app.start();

console.log("Server running at http://localhost:3000");
```

## 启动开发服务器

```bash
bun --hot src/main.ts
```

访问 `http://localhost:3000`，你会看到：

```json
{ "message": "Hello, Aeron!" }
```

## 添加中间件

```typescript
import { createApp, createRouter, compose } from "@aeron/core";
import type { Middleware } from "@aeron/core";

// 日志中间件
const logger: Middleware = async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`${ctx.method} ${ctx.path} - ${Date.now() - start}ms`);
};

// 认证中间件示例
const auth: Middleware = async (ctx, next) => {
  const token = ctx.headers.get("authorization");
  if (!token) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }
  await next();
};

const router = createRouter();
router.get("/protected", async (ctx) => {
  return ctx.json({ data: "secret" });
});

const app = createApp({ port: 3000 });
app.use(logger);
app.use(router.middleware());
app.start();
```

## 完整示例：带数据库和认证

```typescript
import { createApp, createRouter } from "@aeron/core";
import { createQueryBuilder } from "@aeron/database";
import { createJWT, createRBAC } from "@aeron/auth";
import { createCache, createMemoryAdapter } from "@aeron/cache";
import { createLogger } from "@aeron/observability";

// 初始化依赖
const logger = createLogger({ level: "info" });
const db = createQueryBuilder({ url: process.env.DATABASE_URL! });
const jwt = createJWT({ secret: process.env.JWT_SECRET! });
const cache = createCache({ adapter: createMemoryAdapter(), ttl: 300 });
const rbac = createRBAC();

// 定义权限角色
rbac.addRole("admin", ["users:read", "users:write", "users:delete"]);
rbac.addRole("user", ["users:read"]);

const router = createRouter();

// 登录路由
router.post("/auth/login", async (ctx) => {
  const { email, password } = await ctx.body<{ email: string; password: string }>();

  const user = await db
    .from("users")
    .where("email", "=", email)
    .first();

  if (!user) {
    return ctx.json({ error: "Invalid credentials" }, 401);
  }

  const token = await jwt.sign({ sub: user.id, role: user.role });
  return ctx.json({ token });
});

// 受保护的路由
router.get("/users", async (ctx) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  const payload = await jwt.verify(token!);

  if (!rbac.can(payload.role, "users:read")) {
    return ctx.json({ error: "Forbidden" }, 403);
  }

  // 先检查缓存
  const cached = await cache.get("users:all");
  if (cached) {
    return ctx.json(cached);
  }

  const users = await db.from("users").select(["id", "name", "email"]).execute();
  await cache.set("users:all", users);

  return ctx.json(users);
});

const app = createApp({ port: 3000 });
app.use(router.middleware());

app.onStart(() => {
  logger.info("Server started", { port: 3000 });
});

app.start();
```

## 下一步

- 深入了解[路由系统](/core/router/)
- 了解[中间件机制](/core/middleware/)
- 配置[数据库连接](/database/connection/)
- 设置[认证和授权](/auth/jwt/)
