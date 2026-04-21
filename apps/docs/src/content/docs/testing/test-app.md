---
title: 测试应用
description: 使用 createTestApp 编写集成测试
---

`@aeron/testing` 提供了测试工具，让你可以在不启动真实服务器的情况下测试路由处理程序。

## createTestApp

```typescript
import { createTestApp } from "@aeron/testing";
import { describe, test, expect } from "bun:test";
import { createRouter } from "@aeron/core";

const router = createRouter();
router.get("/hello", async (ctx) => ctx.json({ message: "Hello!" }));

const app = createTestApp();
app.use(router.middleware());

describe("GET /hello", () => {
  test("returns greeting", async () => {
    const res = await app.request("GET", "/hello");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toBe("Hello!");
  });
});
```

## 发送不同类型请求

```typescript
const app = createTestApp();
app.use(userRouter.middleware());

// GET 请求
const getRes = await app.request("GET", "/users/1");

// POST 请求（JSON body）
const postRes = await app.request("POST", "/users", {
  body: JSON.stringify({ name: "Alice", email: "alice@example.com" }),
  headers: { "Content-Type": "application/json" },
});

// 带认证头
const authRes = await app.request("GET", "/protected", {
  headers: { "Authorization": `Bearer ${token}` },
});
```

## 测试中间件

```typescript
import { createTestApp } from "@aeron/testing";
import { authMiddleware } from "../middleware/auth";

const app = createTestApp();
app.use(authMiddleware);
app.use(async (ctx) => ctx.json({ user: ctx.state.user }));

test("rejects invalid token", async () => {
  const res = await app.request("GET", "/", {
    headers: { "Authorization": "Bearer invalid-token" },
  });
  expect(res.status).toBe(401);
});

test("accepts valid token", async () => {
  const token = await jwt.sign({ sub: "user_1", role: "user" });
  const res = await app.request("GET", "/", {
    headers: { "Authorization": `Bearer ${token}` },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.user.sub).toBe("user_1");
});
```

## 与真实数据库测试

```typescript
import { createTestApp } from "@aeron/testing";
import { createQueryBuilder } from "@aeron/database";

let db: QueryBuilder;

beforeAll(async () => {
  // 使用测试数据库
  db = createQueryBuilder({ url: process.env.TEST_DATABASE_URL! });
  await runMigrations(db);
});

afterEach(async () => {
  // 每个测试后清理数据
  await db.raw("DELETE FROM users WHERE email LIKE '%@test.com'");
});

test("creates a user", async () => {
  const app = createTestApp();
  app.use(createUsersRouter(db).middleware());

  const res = await app.request("POST", "/users", {
    body: JSON.stringify({ name: "Test", email: "test@test.com", password: "password123" }),
    headers: { "Content-Type": "application/json" },
  });

  expect(res.status).toBe(201);
  const user = await res.json();
  expect(user.email).toBe("test@test.com");
});
```

## TestApp 接口

```typescript
interface TestAppRequestOptions {
  body?: string;
  headers?: Record<string, string>;
}

interface TestApp {
  use(middleware: Middleware): void;
  request(method: string, path: string, options?: TestAppRequestOptions): Promise<Response>;
}
```
