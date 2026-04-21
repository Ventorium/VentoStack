---
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

## 读取请求体

```typescript
// 解析 JSON 请求体
router.post("/users", async (ctx) => {
  const body = await ctx.body<{ name: string; email: string }>();
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

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" }
  });
});
```

## 状态（State）

`ctx.state` 是一个可扩展的对象，用于在中间件之间传递数据：

```typescript
// 在认证中间件中设置用户信息
const authMiddleware: Middleware = async (ctx, next) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  ctx.state.user = await jwt.verify(token!);
  await next();
};

// 在路由处理程序中访问
router.get("/profile", async (ctx) => {
  const user = ctx.state.user;
  return ctx.json({ profile: user });
});
```

## Context 接口

```typescript
interface Context {
  // 请求信息
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Headers;
  request: Request;

  // 状态
  state: Record<string, unknown>;

  // 响应辅助
  json(data: unknown, status?: number, headers?: Record<string, string>): Response;
  text(text: string, status?: number): Response;
  html(html: string, status?: number): Response;
  redirect(url: string, status?: number): Response;
}
```
