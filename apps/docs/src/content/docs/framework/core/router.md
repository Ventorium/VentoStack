---
order: 4
title: 路由系统
description: 使用 createRouter 定义 HTTP 路由，支持参数路由、资源路由和路由分组
---

`createRouter` 提供了完整的 HTTP 路由功能，支持路径参数、通配符、资源路由和路由分组。

## 基本路由

```typescript
import { createRouter } from "@ventostack/core";

const router = createRouter();

// HTTP 方法
router.get("/users", async (ctx) => ctx.json(await getUsers()));
router.post("/users", async (ctx) => ctx.json(await createUser(ctx.body)));
router.put("/users/:id", async (ctx) => ctx.json(await updateUser(ctx.params.id, ctx.body)));
router.patch("/users/:id", async (ctx) => ctx.json(await patchUser(ctx.params.id, ctx.body)));
router.delete("/users/:id", async (ctx) => ctx.json(await deleteUser(ctx.params.id)));
```

## 路径参数

使用 `:name` 定义路径参数，通过 `ctx.params` 访问：

```typescript
router.get("/users/:id<int>", async (ctx) => {
  // ctx.params.id 被推导为 number
  const { id } = ctx.params;
  const user = await db.query(UserModel).where("id", "=", id).get();
  return ctx.json(user);
});

// 多个参数
router.get("/orgs/:orgId/repos/:repoId", async (ctx) => {
  const { orgId, repoId } = ctx.params;
  return ctx.json({ orgId, repoId });
});
```

## 路径参数类型标记

使用 `:name<type>` 语法为路径参数声明类型，框架会自动推导 TypeScript 类型并在运行时做转换和校验：

```typescript
router.get("/users/:id<int>", async (ctx) => {
  // ctx.params.id 被推导为 number，运行时自动 parseInt
  const user = await db.query(UserModel).where("id", "=", ctx.params.id).get();
  return ctx.json(user);
});

router.get("/events/:at<date>", async (ctx) => {
  // ctx.params.at 被推导为 Date
  return ctx.json({ at: ctx.params.at.toISOString() });
});

// 多个类型化参数
router.get("/users/:userId<int>/posts/:postId<int>", async (ctx) => {
  // ctx.params.userId → number
  // ctx.params.postId → number
  return ctx.json({ userId: ctx.params.userId, postId: ctx.params.postId });
});
```

### 支持的内置类型

| 标记 | TypeScript 类型 | 运行时转换 | 默认正则 |
|------|----------------|-----------|---------|
| `:name<string>` | `string` | 原样 | `[^/]+` |
| `:name<int>` | `number` | `parseInt` | `\d+` |
| `:name<float>` | `number` | `parseFloat` | `-?\d+(\.\d+)?` |
| `:name<bool>` | `boolean` | `v === "true"` | `true\|false\|1\|0` |
| `:name<uuid>` | `string` | 原样 | UUID v4 |
| `:name<date>` | `Date` | `new Date(v)` | ISO 8601 |

无类型标记的参数（如 `:id`）默认推导为 `string`。

### 自定义正则约束

在类型标记后附加 `(regex)` 可覆盖默认正则：

```typescript
// 年份必须是 4 位数字
router.get("/archive/:year<int>(\\d{4})", async (ctx) => {
  return ctx.json({ year: ctx.params.year });
});

// 代码必须是大写两位字母
router.get("/items/:code<string>(^[A-Z]{2}$)", async (ctx) => {
  return ctx.json({ code: ctx.params.code });
});
```

自定义正则只影响校验，不改变 TypeScript 推导类型。当参数值不匹配正则时，请求会自动返回 400 `VALIDATION_ERROR`。

## 查询参数（类型化与校验）

通过 Schema 声明查询参数，可同时获得 TypeScript 类型推导和运行时自动校验：

```typescript
router.get("/users", {
  query: {
    page: { type: "int", default: 1, min: 1, description: "页码" },
    limit: { type: "int", default: 20, min: 1, max: 100 },
    search: { type: "string", max: 100 },
  },
}, async (ctx) => {
  // ctx.query.page   → number (默认 1)
  // ctx.query.limit  → number (默认 20)
  // ctx.query.search → string | undefined
  const users = await getUsers(ctx.query.page, ctx.query.limit, ctx.query.search);
  return ctx.json({ users });
});
```

不传 Schema 时保持现有兼容行为，`ctx.query` 为 `Record<string, string>`：

```typescript
router.get("/legacy", async (ctx) => {
  const { page = "1", limit = "20" } = ctx.query;
  return ctx.json({ page, limit });
});
```

## 请求体（类型化与校验）

通过 `body` Schema 声明 JSON 请求体，框架自动解析、转换和校验：

```typescript
router.post("/users", {
  body: {
    email: { type: "string", required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    age: { type: "int", min: 0, max: 150 },
  },
}, async (ctx) => {
  // ctx.body.email → string
  // ctx.body.age   → number | undefined
  const user = await createUser(ctx.body.email, ctx.body.age);
  return ctx.json(user, 201);
});
```

校验失败时自动返回 400 `VALIDATION_ERROR`，无需在 handler 中手动处理。

## 请求头（类型化与校验）

通过 `headers` Schema 声明需要提取和校验的请求头：

```typescript
router.get("/users", {
  headers: {
    authorization: { type: "string", required: true },
    "x-request-id": { type: "string" },
  },
}, async (ctx) => {
  // 声明的字段会按大小写不敏感匹配提取
  const token = ctx.headers.get("authorization");
  return ctx.json({ ok: true });
});
```

## FormData（类型化与校验）

通过 `formData` Schema 声明 multipart 表单字段，支持文本字段类型转换和文件上传限制：

```typescript
router.post("/upload", {
  formData: {
    title: { type: "string", required: true },
    avatar: {
      type: "file",
      required: true,
      maxSize: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg"],
    },
  },
}, async (ctx) => {
  // ctx.formData.title  → string
  // ctx.formData.avatar → File
  return ctx.json({ title: ctx.formData.title, size: ctx.formData.avatar.size });
});
```

## 响应类型推导

`ctx.json(data)` 返回 `TypedResponse<T>`，可从 handler 的返回类型中推导响应结构：

```typescript
router.get("/users/:id", {
  responses: {
    200: {
      id: { type: "int" },
      name: { type: "string" },
    },
  },
}, async (ctx) => {
  const user = await getUser(ctx.params.id);
  return ctx.json(user); // TypedResponse<{ id: number; name: string }>
});
```

`responses` Schema 同时用于 OpenAPI 文档自动生成和运行时响应校验。

## OpenAPI 自动推导

路由中的 Schema 声明会自动转换为 OpenAPI Operation，无需手写两遍：

```typescript
router.get("/users", {
  query: {
    page: { type: "int", default: 1, description: "页码" },
  },
  headers: {
    authorization: { type: "string", required: true },
  },
  responses: {
    200: {
      users: { type: "array", items: { type: "object", properties: { id: { type: "int" }, name: { type: "string" } } } },
    },
  },
}, async (ctx) => {
  return ctx.json({ users: [] });
});
```

生成的 OpenAPI 将自动包含：
- Query 参数（带类型、默认值、描述）
- Header 参数（带 required 标记）
- Request Body（JSON 或 multipart）
- Response Schema（按状态码组织）

## 通配符路由

```typescript
// 匹配 /static/xxx 下的所有路径
router.get("/static/*", async (ctx) => {
  const filePath = ctx.params["*"];
  const file = Bun.file(`./public/${filePath}`);
  return new Response(file);
});
```

## 资源路由

使用 `router.resource()` 快速定义 RESTful 资源路由：

```typescript
router.resource("/users", {
  index: async (ctx) => ctx.json(await getUsers()),         // GET /users
  show: async (ctx) => ctx.json(await getUser(ctx.params.id)),  // GET /users/:id
  create: async (ctx) => ctx.json(await createUser(ctx.body), 201), // POST /users
  update: async (ctx) => ctx.json(await updateUser(ctx.params.id, ctx.body)), // PUT /users/:id
  destroy: async (ctx) => ctx.json(await deleteUser(ctx.params.id)), // DELETE /users/:id
});
```

等价于手动定义：
- `GET /users` → `index`
- `GET /users/:id` → `show`
- `POST /users` → `create`
- `PUT /users/:id` → `update`
- `DELETE /users/:id` → `destroy`

## 路由分组

使用 `router.group()` 创建带前缀的路由分组，分组内的路由会自动拼接前缀，并可统一附加中间件：

```typescript
const router = createRouter();

// 基础分组
router.group("/api/v1", (api) => {
  api.get("/users", async (ctx) => ctx.json(await getUsers()));
  api.post("/users", async (ctx) => ctx.json(await createUser(ctx.body), 201));
  api.get("/users/:id", async (ctx) => ctx.json(await getUser(ctx.params.id)));
});

// 嵌套分组
router.group("/api", (api) => {
  api.group("/v2", (v2) => {
    v2.get("/users", async (ctx) => ctx.json(await getUsersV2()));
  });
});
```

分组支持统一附加中间件：

```typescript
const requireAuth: Middleware = async (ctx, next) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return ctx.json({ error: "Unauthorized" }, 401);
  return next();
};

// /admin 下的所有路由都需要认证
router.group("/admin", (admin) => {
  admin.get("/dashboard", async (ctx) => ctx.json({ stats: {} }));
  admin.get("/settings", async (ctx) => ctx.json({ config: {} }));
}, requireAuth);
```

分组中间件与路由级中间件会按顺序组合：先执行分组中间件，再执行路由中间件。

如果需要将独立创建的 Router 合并到当前 Router，使用 `merge`：

```typescript
const subRouter = createRouter();
subRouter.get("/health", async (ctx) => ctx.json({ status: "ok" }));

const mainRouter = createRouter();
mainRouter.merge(subRouter);
```

## 命名路由

使用 `namedRoute` 注册带名称的路由，可通过 `url()` 生成 URL：

```typescript
router.namedRoute("user-detail", "GET", "/users/:id", async (ctx) => {
  return ctx.json(await getUser(ctx.params.id));
});

// 生成 URL
const url = router.url("user-detail", { id: "123" });
// "/users/123"
```

## 路由中间件

路由级中间件只对该路由生效：

```typescript
const requireAuth: Middleware = async (ctx, next) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return ctx.json({ error: "Unauthorized" }, 401);
  ctx.state.user = await jwt.verify(token);
  await next();
};

// 所有路由都需要认证
router.use(requireAuth);
router.get("/protected", async (ctx) => ctx.json(ctx.state.user));
```

## 路由文档元数据

使用 `doc()` 为已有路由附加 OpenAPI 文档信息：

```typescript
router.get("/users", async (ctx) => ctx.json(await getUsers()));
router.doc("GET", "/users", {
  summary: "获取用户列表",
  tags: ["users"],
});
```

## 注册到应用

```typescript
const app = createApp({ port: 3000 });
app.use(router);
await app.listen();
```

## Router 接口

```typescript
interface Router {
  get<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  get<Path extends string>(path: Path, config: RouteConfig, handler: RouteHandler<...>, ...middleware: Middleware[]): Router;
  post<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  post<Path extends string>(path: Path, config: RouteConfig, handler: RouteHandler<...>, ...middleware: Middleware[]): Router;
  put<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  put<Path extends string>(path: Path, config: RouteConfig, handler: RouteHandler<...>, ...middleware: Middleware[]): Router;
  patch<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  patch<Path extends string>(path: Path, config: RouteConfig, handler: RouteHandler<...>, ...middleware: Middleware[]): Router;
  delete<Path extends string>(path: Path, handler: RouteHandler<InferParams<Path>>, ...middleware: Middleware[]): Router;
  delete<Path extends string>(path: Path, config: RouteConfig, handler: RouteHandler<...>, ...middleware: Middleware[]): Router;
  use(...middleware: Middleware[]): Router;
  group(prefix: string, callback: (group: Router) => void, ...middleware: Middleware[]): Router;
  resource(prefix: string, handlers: ResourceHandlers, ...middleware: Middleware[]): Router;
  namedRoute(name: string, method: string, path: string, handler: RouteHandler, ...middleware: Middleware[]): Router;
  url(name: string, params?: Record<string, string>): string;
  routes(): readonly RouteDefinition[];
  compile(globalMiddleware?: Middleware[]): CompiledRoutes;
  doc(method: string, path: string, metadata: Record<string, unknown>): Router;
  merge(router: Router): Router;
}

type RouteHandler<
  TParams extends Record<string, unknown> = Record<string, string>,
  TQuery extends Record<string, unknown> = Record<string, string>,
  TBody extends Record<string, unknown> = Record<string, unknown>,
  TFormData extends Record<string, unknown> = Record<string, unknown>,
  TResponse = unknown,
> = (ctx: Context<TParams, TQuery, TBody, TFormData>) => Promise<TypedResponse<TResponse> | Response> | TypedResponse<TResponse> | Response;
```
