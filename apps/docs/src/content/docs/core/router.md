---
title: 路由系统
description: 使用 createRouter 定义 HTTP 路由，支持参数路由、资源路由和路由分组
---

`createRouter` 提供了完整的 HTTP 路由功能，支持路径参数、通配符、资源路由和路由分组。

## 基本路由

```typescript
import { createRouter } from "@aeron/core";

const router = createRouter();

// HTTP 方法
router.get("/users", async (ctx) => ctx.json(await getUsers()));
router.post("/users", async (ctx) => ctx.json(await createUser(await ctx.body())));
router.put("/users/:id", async (ctx) => ctx.json(await updateUser(ctx.params.id, await ctx.body())));
router.patch("/users/:id", async (ctx) => ctx.json(await patchUser(ctx.params.id, await ctx.body())));
router.delete("/users/:id", async (ctx) => ctx.json(await deleteUser(ctx.params.id)));
```

## 路径参数

使用 `:name` 定义路径参数，通过 `ctx.params` 访问：

```typescript
router.get("/users/:id", async (ctx) => {
  const { id } = ctx.params;
  const user = await db.from("users").where("id", "=", id).first();
  return ctx.json(user);
});

// 多个参数
router.get("/orgs/:orgId/repos/:repoId", async (ctx) => {
  const { orgId, repoId } = ctx.params;
  return ctx.json({ orgId, repoId });
});
```

## 查询参数

通过 `ctx.query` 访问查询字符串：

```typescript
router.get("/users", async (ctx) => {
  const { page = "1", limit = "20", search } = ctx.query;
  const users = await db
    .from("users")
    .where("name", "LIKE", `%${search}%`)
    .limit(Number(limit))
    .offset((Number(page) - 1) * Number(limit))
    .execute();
  return ctx.json({ users, page: Number(page), limit: Number(limit) });
});
```

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
  create: async (ctx) => ctx.json(await createUser(await ctx.body()), 201), // POST /users
  update: async (ctx) => ctx.json(await updateUser(ctx.params.id, await ctx.body())), // PUT /users/:id
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

将 router 作为另一个 router 的子路由，实现路由分组：

```typescript
const apiRouter = createRouter();
const v1Router = createRouter();
const v2Router = createRouter();

v1Router.get("/users", handler);
v2Router.get("/users", newHandler);

// 将子路由挂载到前缀路径
apiRouter.use("/v1", v1Router.middleware());
apiRouter.use("/v2", v2Router.middleware());
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

## 注册到应用

```typescript
const app = createApp({ port: 3000 });
app.use(router.middleware());
app.start();
```

## Router 接口

```typescript
interface Router {
  get(path: string, ...handlers: RouteHandler[]): void;
  post(path: string, ...handlers: RouteHandler[]): void;
  put(path: string, ...handlers: RouteHandler[]): void;
  patch(path: string, ...handlers: RouteHandler[]): void;
  delete(path: string, ...handlers: RouteHandler[]): void;
  use(path: string, middleware: Middleware): void;
  use(middleware: Middleware): void;
  resource(path: string, handlers: ResourceHandlers): void;
  middleware(): Middleware;
}

type RouteHandler = (ctx: Context) => Response | Promise<Response>;
```
