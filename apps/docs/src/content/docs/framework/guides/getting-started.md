---
order: 2
title: 快速开始
description: 5 分钟内创建并运行你的第一个 VentoStack 应用
---

## 前置条件

安装 [Bun](https://bun.sh)（>= 1.0.0）：

```bash
curl -fsSL https://bun.sh/install | bash
```

## 创建项目

```bash
mkdir my-ventostack-app
cd my-ventostack-app
bun init -y
```

## 安装依赖

```bash
bun add @ventostack/core
```

## 创建应用

创建 `src/main.ts`：

```typescript
import { createApp, createRouter } from "@ventostack/core";

const router = createRouter();

router.get("/", async (ctx) => {
  return ctx.json({ message: "Hello, VentoStack!" });
});

router.get("/users/:id", async (ctx) => {
  const id = ctx.params["id"];
  return ctx.json({ id, name: "Alice" });
});

const app = createApp({ port: 3000 });
app.use(router);
await app.listen();

console.log("Server running at http://localhost:3000");
```

## 启动开发服务器

```bash
bun --hot src/main.ts
```

访问 `http://localhost:3000`，你会看到：

```json
{ "message": "Hello, VentoStack!" }
```

## 添加中间件

```typescript
import { createApp, createRouter } from "@ventostack/core";
import type { Middleware } from "@ventostack/core";

// 日志中间件
const logger: Middleware = async (ctx, next) => {
  const start = performance.now();
  const response = await next();
  console.log(`${ctx.method} ${ctx.path} - ${Math.round(performance.now() - start)}ms`);
  return response;
};

// 认证中间件示例
const auth: Middleware = async (ctx, next) => {
  const token = ctx.headers.get("authorization");
  if (!token) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }
  return next();
};

const router = createRouter();
router.get("/protected", async (ctx) => {
  return ctx.json({ data: "secret" });
}, auth);

const app = createApp({ port: 3000 });
app.use(logger);
app.use(router);
await app.listen();
```

## 完整示例：带数据库和认证

首先安装额外依赖：

```bash
bun add @ventostack/database @ventostack/auth @ventostack/cache @ventostack/observability
```

```typescript
import { createApp, createRouter, requestLogger, errorHandler } from "@ventostack/core";
import { createDatabase, defineModel, column } from "@ventostack/database";
import { createJWT, createRBAC, createPasswordHasher } from "@ventostack/auth";
import { createCache, createMemoryAdapter } from "@ventostack/cache";
import { createLogger } from "@ventostack/observability";

// 定义数据模型
const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  email: column.varchar({ length: 255, unique: true }),
  password: column.varchar({ length: 255 }),
  name: column.varchar({ length: 255 }),
  role: column.varchar({ length: 50 }),
});

// 初始化依赖
const logger = createLogger({ level: "info" });

const db = createDatabase({ url: "sqlite://data/app.db" });

const jwt = createJWT({
  secret: process.env.JWT_SECRET || "please_change_me_please_change_me",
});

const passwordHasher = createPasswordHasher();
const cache = createCache(createMemoryAdapter());
const rbac = createRBAC();

// 定义权限角色
rbac.addRole({
  name: "admin",
  permissions: [
    { resource: "users", action: "read" },
    { resource: "users", action: "write" },
    { resource: "users", action: "delete" },
  ],
});
rbac.addRole({
  name: "user",
  permissions: [{ resource: "users", action: "read" }],
});

const router = createRouter();

// 注册路由
router.post("/auth/register", async (ctx) => {
  const { email, password, name } = await ctx.request.json() as {
    email: string;
    password: string;
    name: string;
  };

  const existing = await db.query(UserModel).where("email", "=", email).get();
  if (existing) {
    return ctx.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await passwordHasher.hash(password);
  const user = await db
    .query(UserModel)
    .insert({ email, password: passwordHash, name, role: "user" });

  return ctx.json({ id: user?.id, email, name }, 201);
});

// 登录路由
router.post("/auth/login", async (ctx) => {
  const { email, password } = await ctx.request.json() as { email: string; password: string };

  const user = await db.query(UserModel).where("email", "=", email).get();
  if (!user) {
    return ctx.json({ error: "用户名或密码错误" }, 401);
  }

  const valid = await passwordHasher.verify(password, user.password);
  if (!valid) {
    return ctx.json({ error: "用户名或密码错误" }, 401);
  }

  const token = await jwt.sign({ sub: String(user.id), role: user.role });
  return ctx.json({ token });
});

// 受保护的路由
router.get("/users", async (ctx) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }

  const payload = await jwt.verify(token);

  if (!rbac.can([payload.role as string], "users", "read")) {
    return ctx.json({ error: "Forbidden" }, 403);
  }

  const users = await cache.remember("users:all", 300, async () => {
    return db.query(UserModel).select("id", "name", "email").list();
  });

  return ctx.json(users);
});

const app = createApp({ port: 3000 });
app.use(errorHandler({ logger }));
app.use(requestLogger({ logger }));
app.use(router);

// 启动前自动建表（示例用；生产环境应使用迁移工具）
await db.raw(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT
  )
`);

await app.listen();
```

## 下一步

- 深入了解[路由系统](/framework/core/router/)
- 了解[中间件机制](/framework/core/middleware/)
- 配置[数据库连接](/framework/database/connection/)
- 设置[认证和授权](/platform/auth/jwt/)
