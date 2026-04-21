---
title: Mock 工具
description: 使用 createMockRequest 和其他测试辅助工具
---

`@aeron/testing` 提供了丰富的 Mock 和测试辅助工具。

## createMockRequest

创建模拟的 HTTP 请求：

```typescript
import { createMockRequest } from "@aeron/testing";

const ctx = createMockRequest({
  method: "POST",
  path: "/users",
  body: { name: "Alice", email: "alice@example.com" },
  headers: {
    "content-type": "application/json",
    "authorization": "Bearer test-token",
  },
  params: { id: "123" },
  query: { page: "1", limit: "20" },
});

// 单独测试路由处理函数
const handler = async (ctx: Context) => {
  const body = await ctx.body<{ name: string }>();
  return ctx.json({ created: body.name });
};

const res = await handler(ctx);
expect(res.status).toBe(200);
```

## waitFor

等待异步条件满足：

```typescript
import { waitFor } from "@aeron/testing";

test("event is processed", async () => {
  let processed = false;

  bus.subscribe(UserRegistered, async () => {
    processed = true;
  });

  await bus.publish(UserRegistered, { userId: "1", email: "a@b.com", registeredAt: new Date() });

  await waitFor(() => processed === true, { timeout: 1000 });
  expect(processed).toBe(true);
});
```

## expectJSON

类型安全的 JSON 响应断言：

```typescript
import { expectJSON } from "@aeron/testing";

test("returns user", async () => {
  const res = await app.request("GET", "/users/1");

  const body = await expectJSON<{ id: string; name: string }>(res, 200);
  expect(body.id).toBe("1");
  expect(body.name).toBe("Alice");
});
```

## Mock 缓存

```typescript
import { createMockCache } from "@aeron/testing";

const cache = createMockCache();

// 预设缓存数据
cache.preset("user:1", { id: "1", name: "Alice" });

// 验证缓存调用
expect(cache.get).toHaveBeenCalledWith("user:1");
expect(cache.set).toHaveBeenCalledWith("user:1", expect.any(Object));
```

## Mock 数据库

```typescript
import { createMockDatabase } from "@aeron/testing";

const db = createMockDatabase();

// 设置查询返回值
db.mockQuery("SELECT * FROM users", [
  { id: "1", name: "Alice" },
  { id: "2", name: "Bob" },
]);

// 测试使用
const users = await db.from("users").execute();
expect(users).toHaveLength(2);
```
