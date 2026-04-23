# VentoStack 框架

[English](./README_en.md)

VentoStack 是一个基于 Bun 运行时构建的全栈后端框架，专为高性能和极致开发体验而设计。它遵循函数式优先的设计原则——无 class、无装饰器、显式依赖注入。

## 模块概览

VentoStack 将后端能力拆分为可按需组合的独立包：

| 包名 | 说明 |
|---|---|
| `@ventostack/core` | HTTP 服务、路由、中间件、配置管理、生命周期、错误处理 |
| `@ventostack/database` | 查询构建器、数据库迁移、连接池、事务管理 |
| `@ventostack/cache` | 缓存层，支持内存适配器与 Redis 适配器 |
| `@ventostack/auth` | JWT、RBAC 权限、OAuth 登录、Session 管理、MFA |
| `@ventostack/events` | 事件总线、发布订阅、事件溯源、CQRS |
| `@ventostack/observability` | 指标采集、链路追踪、结构化日志、健康检查 |
| `@ventostack/openapi` | OpenAPI 3.1 文档生成与请求校验 |
| `@ventostack/testing` | 测试工具、Mock 辅助、测试应用封装 |
| `@ventostack/ai` | AI 集成：LLM 适配器、RAG 流水线、流式响应 |
| `@ventostack/cli` | 脚手架与代码生成 CLI 工具 |

## 设计原则

- **Bun 优先**：专为 Bun 运行时构建，不做 Node.js 兼容层
- **函数式优先**：工厂函数（`createXxx()`），无 class、无装饰器
- **显式依赖**：无全局单例，所有依赖通过参数传入
- **编译期安全**：全程 TypeScript strict 模式，类型错误在编译时暴露

## 快速上手

### 环境要求

- [Bun](https://bun.sh) >= 1.0.0

### 安装

```bash
bun add @ventostack/core
```

### 基础应用

```typescript
import { createApp, createRouter } from "@ventostack/core";

const router = createRouter();

router.get("/", async (ctx) => {
  return ctx.json({ message: "你好，VentoStack！" });
});

const app = createApp({ port: 3000 });
app.use(router);
await app.listen();
```

### 集成认证

```typescript
import { createApp, createRouter } from "@ventostack/core";
import { createJWT, createRBAC } from "@ventostack/auth";

const jwt = createJWT({ secret: process.env.JWT_SECRET! });
const rbac = createRBAC();

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

router.get("/protected", async (ctx) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  const payload = await jwt.verify(token!);
  return ctx.json({ user: payload });
});
```

### 集成数据库

```typescript
import { createDatabase, defineModel, column } from "@ventostack/database";

const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  email: column.varchar({ length: 255 }),
  name: column.varchar({ length: 255 }),
});

const db = createDatabase({
  url: process.env.DATABASE_URL!,
  executor: async () => [],
});

const users = await db
  .query(UserModel)
  .select("id", "name", "email")
  .where("active", "=", true)
  .limit(10)
  .list();
```

### 集成缓存

```typescript
import { createCache, createMemoryAdapter } from "@ventostack/cache";

const cache = createCache(createMemoryAdapter());

await cache.set("key", { data: "value" }, { ttl: 300 });
const result = await cache.get("key");
```

## 路由 Schema 与响应声明

```typescript
import { createRouter, defineRouteConfig } from "@ventostack/core";

const router = createRouter();

router.get("/things", defineRouteConfig({
  query: {
    page: { type: "int", default: 1 },
  },
  responses: {
    200: {
      page: { type: "int" },
    },
  },
}), (ctx) => {
  return ctx.json({ page: ctx.query.page });
});

router.get("/health", defineRouteConfig({
  responses: {
    200: {
      contentType: "text/plain",
      schema: { type: "string" },
      description: "Plain text health check",
    },
  },
}), (ctx) => ctx.text("ok"));

const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("data: hello\n\n"));
    controller.close();
  },
});

router.get("/events", defineRouteConfig({
  responses: {
    200: {
      contentType: "text/event-stream",
      schema: { type: "string" },
      description: "Server-Sent Events stream",
    },
  },
}), (ctx) => ctx.stream(stream, "text/event-stream"));
```

- `responses: { 200: { id: { type: "int" } } }` 是 JSON 响应的简写。
- 非 JSON 响应用 `contentType + schema` 形式声明，例如 `text/plain`、`text/html`、`text/event-stream`。
- 已声明的响应 schema 会在运行时校验非流式 `application/json` 和 `text/*` 响应；不匹配时返回 `RESPONSE_VALIDATION_ERROR`。
- 如果 VS Code 在 `router.get()` 的第二个参数上提示不稳定，优先用 `defineRouteConfig(...)`，它会保留类型推导并提供更稳定的属性补全。

## 目录结构

```
fullstack/
  apps/
    example/          - 示例应用
    docs/             - 文档站点（Starlight）
  packages/
    core/             - 核心 HTTP 框架
    database/         - 数据库层
    cache/            - 缓存层
    auth/             - 认证与授权
    events/           - 事件系统
    observability/    - 指标、追踪、日志
    openapi/          - OpenAPI 文档生成
    testing/          - 测试工具
    ai/               - AI 集成
    cli/              - CLI 工具
  docs/               - 文档源文件
```

## 开发命令

```bash
# 安装依赖
bun install

# 启动示例应用（热更新）
bun dev

# 启动文档开发服务器
bun run dev:doc

# 运行全部测试
bun test

# 运行测试并输出覆盖率
bun test --coverage

# 类型检查
bun run typecheck
```

## 发布流程

- `packages/` 下的可发布包通过 GitHub Actions 自动发布到 npm
- 任何触及 `packages/**` 的 PR 都需要同时提交 `.changeset/*.md`
- 合并到 `main` 后，`Changesets` 会先生成版本变更，然后自动发布
- 发布使用 npm Trusted Publishing / OIDC，不再需要 `NPM_TOKEN`
- 需要在 npmjs.com 上把该仓库的 GitHub Actions workflow 注册为 trusted publisher

## 测试

所有包均使用 `bun:test` 编写测试，覆盖每个模块的单元测试。

```bash
# 运行全部测试
bun test

# 运行指定包的测试
bun test packages/core

# 运行指定测试文件
bun test packages/core/src/__tests__/router.test.ts
```

## 环境配置

VentoStack 遵循十二要素应用方法论，使用环境变量进行配置。各包的详细配置项请参阅对应文档。

```bash
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

## 开源协议

MIT
