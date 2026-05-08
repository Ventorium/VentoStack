---
order: 3
title: 请求上下文
description: Context 对象包含当前请求的所有信息，以及响应辅助方法
---

`Context`（`ctx`）对象封装了 HTTP 请求和响应的所有信息，在每次请求时创建。

## 请求信息

```typescript
router.get("/example", async (ctx) => {
  // 请求方法
  const method = ctx.method; // "GET" | "POST" | ...

  // 请求路径
  const path = ctx.path; // "/example"

  // 路径参数（:id 等）
  const { id } = ctx.params;

  // 查询字符串参数
  const { page, limit } = ctx.query;

  // 请求头
  const contentType = ctx.headers.get("content-type");
  const auth = ctx.headers.get("authorization");

  // 原始 Request 对象
  const request = ctx.request;
});
```

### 类型化路径参数

当路由路径使用类型标记时，`ctx.params` 会自动推导为对应类型：

```typescript
router.get("/users/:id<int>", async (ctx) => {
  // ctx.params.id 被推导为 number
  const user = await db.query(UserModel).where("id", "=", ctx.params.id).get();
  return ctx.json(user);
});

router.get("/events/:at<date>", async (ctx) => {
  // ctx.params.at 被推导为 Date
  return ctx.json({ at: ctx.params.at.toISOString() });
});
```

无类型标记的参数默认推导为 `string`。

## 读取请求体

```typescript
// 解析 JSON 请求体
router.post("/users", async (ctx) => {
  const body = await ctx.request.json();
  // body.name, body.email
});

// 读取表单数据
router.post("/upload", async (ctx) => {
  const formData = await ctx.request.formData();
  const file = formData.get("file") as File;
});

// 读取原始文本
router.post("/webhook", async (ctx) => {
  const text = await ctx.request.text();
});
```

## 响应辅助方法

### JSON 响应

```typescript
// 默认状态码 200
return ctx.json({ data: "value" });

// 自定义状态码
return ctx.json({ error: "Not Found" }, 404);

// 带自定义响应头
return ctx.json({ data: "value" }, 200, {
  "x-custom-header": "value"
});
```

### 文本响应

```typescript
return ctx.text("Hello, World!");
return ctx.text("Not Found", 404);
```

### HTML 响应

```typescript
return ctx.html("<h1>Hello</h1>");
```

### 重定向

```typescript
return ctx.redirect("/new-path");
return ctx.redirect("https://example.com", 301);
```

### 流式响应

```typescript
router.get("/stream", async (ctx) => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue("data: hello\n\n");
      controller.enqueue("data: world\n\n");
      controller.close();
    }
  });

  return ctx.stream(stream, "text/event-stream");
});
```

## 状态（State）

`ctx.state` 是一个可扩展的对象，用于在中间件之间传递数据。默认情况下它是 `Record<string, unknown>`，你可以通过**模块扩展**声明自定义字段来获得完整的类型提示：

```typescript
// types/context.d.ts
import "@ventostack/core";

declare module "@ventostack/core" {
  interface ContextState {
    user?: { id: string; name: string };
    tenant?: string;
  }
}
```

然后在中间件和路由中使用：

```typescript
// 在认证中间件中设置用户信息
const authMiddleware: Middleware = async (ctx, next) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  ctx.state.user = await jwt.verify(token!);
  return next();
};

// 在路由处理程序中访问——有完整类型提示
router.get("/profile", async (ctx) => {
  const user = ctx.state.user; // 类型：{ id: string; name: string } | undefined
  return ctx.json({ profile: user });
});
```

不同路由使用不同的中间件，因此 `ctx.state` 上的字段是可选的。只有显式注入的中间件才会产生对应的 state 字段。

## Context 接口

```typescript
interface Context<
  TParams extends Record<string, unknown> = Record<string, string>,
  TQuery extends Record<string, unknown> = Record<string, string>,
  TBody extends Record<string, unknown> = Record<string, unknown>,
  TFormData extends Record<string, unknown> = Record<string, unknown>,
> {
  // 请求信息
  readonly request: Request;
  readonly url: URL;
  readonly method: string;
  readonly path: string;
  readonly params: TParams;
  readonly query: TQuery;
  readonly body: TBody;
  readonly headers: Headers;
  readonly formData: TFormData;
  readonly state: ContextState;
  readonly startTime: number;

  user?: unknown;
  tenant?: unknown;

  // 响应辅助
  json<T>(data: T, status?: number, headers?: Record<string, string>): TypedResponse<T>;
  text(text: string, status?: number): Response;
  html(html: string, status?: number): Response;
  redirect(url: string, status?: number): Response;
  stream(body: ReadableStream, contentType?: string): Response;
}
```
