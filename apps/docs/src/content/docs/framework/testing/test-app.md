---
order: 1
title: 测试应用
description: 使用 createTestApp 和 createTestClient 编写集成测试
---

`@ventostack/testing` 提供了测试应用启动和 HTTP 测试客户端，支持随机端口分配、完整请求响应流程测试和生命周期管理。

## createTestApp

`createTestApp(app)` 接收 `VentoStackApp` 实例，自动分配随机端口并启动应用：

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createApp, createRouter } from "@ventostack/core";
import { createTestApp } from "@ventostack/testing";

const router = createRouter();
router.get("/hello", async (ctx) => ctx.json({ message: "Hello!" }));

const app = createApp();
app.use(router);

describe("GET /hello", () => {
  let testApp: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    testApp = await createTestApp(app);
  });

  afterAll(async () => {
    await testApp.close();
  });

  test("returns greeting", async () => {
    const response = await fetch(`${testApp.baseUrl}/hello`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.message).toBe("Hello!");
  });
});
```

## createTestClient

`createTestClient(baseUrl)` 创建便捷的 HTTP 测试客户端，封装了常见请求方法：

```typescript
import { createTestClient, createTestApp } from "@ventostack/testing";

const testApp = await createTestApp(app);
const client = createTestClient(testApp.baseUrl);

// GET 请求
const getRes = await client.get("/users");
expect(getRes.status).toBe(200);
const users = getRes.json<{ id: string; name: string }[]>();

// POST 请求（JSON body）
const postRes = await client.post("/users", {
  name: "Alice",
  email: "alice@example.com",
});
expect(postRes.status).toBe(201);

// PUT 请求
const putRes = await client.put("/users/1", { name: "Alice Updated" });

// PATCH 请求
const patchRes = await client.patch("/users/1", { name: "Alice" });

// DELETE 请求
const deleteRes = await client.delete("/users/1");

// 带查询参数
const queryRes = await client.get("/users", {
  query: { page: "1", limit: "10" },
});

// 设置默认请求头（链式调用）
client
  .setHeader("Authorization", `Bearer ${token}`)
  .setHeader("X-Request-ID", "test-123");

// 批量设置请求头
client.setHeaders({
  "Authorization": `Bearer ${token}`,
  "Content-Type": "application/json",
});
```

## 测试中间件

```typescript
import { createApp, createRouter } from "@ventostack/core";
import { createTestApp, createTestClient } from "@ventostack/testing";
import { requireAuth } from "./middleware/auth";

const router = createRouter();
router.get("/protected", async (ctx) => {
  return ctx.json({ user: ctx.user });
}, requireAuth("secret"));

const app = createApp();
app.use(router);

describe("auth middleware", () => {
  let client: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    const testApp = await createTestApp(app);
    client = createTestClient(testApp.baseUrl);
  });

  test("rejects invalid token", async () => {
    const res = await client.get("/protected");
    expect(res.status).toBe(401);
  });

  test("accepts valid token", async () => {
    const res = await client
      .setHeader("Authorization", `Bearer ${validToken}`)
      .get("/protected");
    expect(res.status).toBe(200);
  });
});
```

## 与真实数据库测试

```typescript
import { createTestApp, createTestClient } from "@ventostack/testing";
import { createDatabase } from "@ventostack/database";
import { createExampleApp } from "../src/app";

describe("integration tests", () => {
  let client: ReturnType<typeof createTestClient>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const db = createDatabase({ url: ":memory:" });
    const { app } = await createExampleApp({ db });
    const testApp = await createTestApp(app);
    client = createTestClient(testApp.baseUrl);
    close = testApp.close;
  });

  afterAll(async () => {
    await close();
  });

  test("creates a user", async () => {
    const res = await client.post("/api/users", {
      name: "Test",
      email: "test@example.com",
      password: "password123",
    });

    expect(res.status).toBe(201);
    const body = res.json<{ id: string; email: string }>();
    expect(body.email).toBe("test@example.com");
  });
});
```

## 接口定义

```typescript
/** 测试应用实例 */
interface TestAppInstance {
  readonly app: VentoStackApp;
  readonly port: number;
  readonly baseUrl: string;
  close(): Promise<void>;
}

/** 测试响应 */
interface TestResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
  readonly text: string;
  json<T = unknown>(): T;
}

/** 请求选项 */
interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string>;
}

/** 测试客户端 */
interface TestClient {
  get(path: string, options?: RequestOptions): Promise<TestResponse>;
  post(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse>;
  put(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse>;
  patch(path: string, body?: unknown, options?: RequestOptions): Promise<TestResponse>;
  delete(path: string, options?: RequestOptions): Promise<TestResponse>;
  setHeader(name: string, value: string): TestClient;
  setHeaders(headers: Record<string, string>): TestClient;
}
```
