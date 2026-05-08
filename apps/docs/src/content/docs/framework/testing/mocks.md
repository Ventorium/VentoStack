---
order: 2
title: 测试工具
description: 使用 Fixture 管理、安全测试套件和测试数据工厂
---

`@ventostack/testing` 提供了 Fixture 管理、安全测试套件和测试数据工厂等测试工具，帮助编写高质量的集成测试和回归测试。

## Fixture 管理

`createFixtureManager()` 创建基于内存的 Fixture 管理器，支持注册、获取和 JSON 文件加载：

```typescript
import { createFixtureManager } from "@ventostack/testing";

const fixtures = createFixtureManager();

// 注册 Fixture
fixtures.register("users", [
  { id: "1", name: "Alice", email: "alice@example.com", role: "admin" },
  { id: "2", name: "Bob", email: "bob@example.com", role: "user" },
]);

fixtures.register("config", {
  apiUrl: "http://localhost:3000",
  timeout: 5000,
});

// 获取 Fixture
const users = fixtures.get<Array<{ id: string; name: string }>>("users");
const config = fixtures.get<{ apiUrl: string; timeout: number }>("config");

// 检查是否存在
if (fixtures.has("users")) {
  // ...
}

// 从 JSON 文件加载
await fixtures.loadJSON("products", "./fixtures/products.json");

// 清空所有 Fixture
fixtures.reset();
```

## 安全测试套件

`createSecurityTestSuite()` 提供 XSS、SQL 注入、路径遍历等常见攻击面的测试能力：

```typescript
import { createSecurityTestSuite } from "@ventostack/testing";
import { createTestClient } from "@ventostack/testing";

const security = createSecurityTestSuite();

// 获取攻击载荷
const xssPayloads = security.xssPayloads();
const sqlPayloads = security.sqlInjectionPayloads();
const pathPayloads = security.pathTraversalPayloads();
const csrfPayloads = security.csrfPayloads();

// 生成超大载荷
const oversized = security.oversizedPayload(1024 * 1024); // 1MB

// 对端点执行安全测试
const client = createTestClient("http://localhost:3000");

const result = await security.testEndpoint(
  { fetch: (url, init) => fetch(url, init) },
  "http://localhost:3000/api/search",
  {
    expectedStatus: [400, 403, 422],
    testXSS: true,
    testSQLi: true,
    testPathTraversal: true,
  },
);

if (!result.passed) {
  console.error("安全测试失败:", result.failures);
}
```

## 测试数据工厂

`defineFactory()` 创建类型安全的测试数据生成器：

```typescript
import { defineFactory, sequence, oneOf, uuid } from "@ventostack/testing";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  age: number;
}

const userFactory = defineFactory<User>({
  fields: {
    id: uuid(),
    name: sequence("user"),
    email: () => `user_${Math.floor(Math.random() * 10000)}@example.com`,
    role: oneOf("admin", "user"),
    age: () => Math.floor(Math.random() * 50) + 18,
  },
});

// 生成单个对象
const user = userFactory.build();

// 生成多个对象
const users = userFactory.buildMany(10);

// 覆盖特定字段
const admin = userFactory.build({ role: "admin", name: "SuperAdmin" });

// 按序列生成
const sequenceUsers = userFactory.buildSequence(5, (index) => ({
  name: `User_${index + 1}`,
  email: `user_${index + 1}@example.com`,
}));
```

## 辅助生成器

```typescript
import { sequence, oneOf, uuid } from "@ventostack/testing";

// 序列生成器
const genId = sequence("item");
console.log(genId()); // "item_1"
console.log(genId()); // "item_2"

// 随机选择
const genRole = oneOf("admin", "editor", "viewer");
console.log(genRole()); // 随机返回一个角色

// UUID 生成器
const genUUID = uuid();
console.log(genUUID()); // "550e8400-e29b-41d4-a716-446655440000"
```

## 完整测试示例

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createApp, createRouter } from "@ventostack/core";
import {
  createTestApp,
  createTestClient,
  createFixtureManager,
  defineFactory,
  uuid,
  sequence,
} from "@ventostack/testing";

const userFactory = defineFactory<{ id: string; name: string; email: string }>({
  fields: {
    id: uuid(),
    name: sequence("user"),
    email: () => `test_${Date.now()}@example.com`,
  },
});

describe("users API", () => {
  let client: ReturnType<typeof createTestClient>;
  let close: () => Promise<void>;
  const fixtures = createFixtureManager();

  beforeAll(async () => {
    const router = createRouter();
    const users: Array<{ id: string; name: string; email: string }> = [];

    router.get("/users", async (ctx) => ctx.json({ data: users }));
    router.post("/users", async (ctx) => {
      const body = await ctx.request.json() as { name: string; email: string };
      const user = { id: crypto.randomUUID(), ...body };
      users.push(user);
      return ctx.json(user, 201);
    });

    const app = createApp();
    app.use(router);

    const testApp = await createTestApp(app);
    client = createTestClient(testApp.baseUrl);
    close = testApp.close;

    fixtures.register("defaultUsers", userFactory.buildMany(3));
  });

  afterAll(async () => {
    await close();
  });

  test("creates user", async () => {
    const user = userFactory.build();
    const res = await client.post("/users", user);
    expect(res.status).toBe(201);
    expect(res.json<{ name: string }>().name).toBe(user.name);
  });

  test("lists users", async () => {
    const res = await client.get("/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json<{ data: unknown[] }>().data)).toBe(true);
  });
});
```

## 接口定义

```typescript
/** Fixture 管理器 */
interface FixtureManager {
  register<T>(name: string, data: T): void;
  get<T>(name: string): T;
  has(name: string): boolean;
  loadJSON<_T>(name: string, filePath: string): Promise<void>;
  reset(): void;
}

/** 安全测试套件 */
interface SecurityTestSuite {
  xssPayloads(): string[];
  sqlInjectionPayloads(): string[];
  pathTraversalPayloads(): string[];
  csrfPayloads(): Array<{ method: string; headers: Record<string, string> }>;
  oversizedPayload(sizeBytes: number): string;
  testEndpoint(
    client: { fetch: (url: string, init?: RequestInit) => Promise<Response> },
    url: string,
    options?: {
      expectedStatus?: number[];
      testXSS?: boolean;
      testSQLi?: boolean;
      testPathTraversal?: boolean;
    },
  ): Promise<{ passed: boolean; failures: string[] }>;
}

/** 工厂定义 */
interface FactoryDefinition<T extends Record<string, unknown>> {
  fields: { [K in keyof T]: T[K] | (() => T[K]) };
}

/** 工厂实例 */
interface Factory<T extends Record<string, unknown>> {
  build(overrides?: Partial<T>): T;
  buildMany(count: number, overrides?: Partial<T>): T[];
  buildSequence(count: number, fn: (index: number) => Partial<T>): T[];
}
```
