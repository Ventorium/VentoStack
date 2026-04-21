# Aeron 框架

[English](./README_en.md)

Aeron 是一个基于 Bun 运行时构建的全栈后端框架，专为高性能和极致开发体验而设计。它遵循函数式优先的设计原则——无 class、无装饰器、显式依赖注入。

## 模块概览

Aeron 将后端能力拆分为可按需组合的独立包：

| 包名 | 说明 |
|---|---|
| `@aeron/core` | HTTP 服务、路由、中间件、配置管理、生命周期、错误处理 |
| `@aeron/database` | 查询构建器、数据库迁移、连接池、事务管理 |
| `@aeron/cache` | 缓存层，支持内存适配器与 Redis 适配器 |
| `@aeron/auth` | JWT、RBAC 权限、OAuth 登录、Session 管理、MFA |
| `@aeron/events` | 事件总线、发布订阅、事件溯源、CQRS |
| `@aeron/observability` | 指标采集、链路追踪、结构化日志、健康检查 |
| `@aeron/openapi` | OpenAPI 3.1 文档生成与请求校验 |
| `@aeron/testing` | 测试工具、Mock 辅助、测试应用封装 |
| `@aeron/ai` | AI 集成：LLM 适配器、RAG 流水线、流式响应 |
| `@aeron/cli` | 脚手架与代码生成 CLI 工具 |

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
bun add @aeron/core
```

### 基础应用

```typescript
import { createApp, createRouter } from "@aeron/core";

const router = createRouter();

router.get("/", async (ctx) => {
  return ctx.json({ message: "你好，Aeron！" });
});

const app = createApp({ port: 3000 });
app.use(router.middleware());
app.start();
```

### 集成认证

```typescript
import { createApp, createRouter } from "@aeron/core";
import { createJWT, createRBAC } from "@aeron/auth";

const jwt = createJWT({ secret: process.env.JWT_SECRET! });
const rbac = createRBAC();

rbac.addRole("admin", ["read", "write", "delete"]);
rbac.addRole("user", ["read"]);

const router = createRouter();

router.get("/protected", async (ctx) => {
  const token = ctx.headers.get("authorization")?.replace("Bearer ", "");
  const payload = await jwt.verify(token!);
  return ctx.json({ user: payload });
});
```

### 集成数据库

```typescript
import { createQueryBuilder } from "@aeron/database";

const db = createQueryBuilder({ url: process.env.DATABASE_URL! });

const users = await db
  .from("users")
  .select(["id", "name", "email"])
  .where("active", "=", true)
  .limit(10)
  .execute();
```

### 集成缓存

```typescript
import { createCache, createMemoryAdapter } from "@aeron/cache";

const cache = createCache({
  adapter: createMemoryAdapter(),
  ttl: 300,
});

await cache.set("key", { data: "value" });
const result = await cache.get("key");
```

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

Aeron 遵循十二要素应用方法论，使用环境变量进行配置。各包的详细配置项请参阅对应文档。

```bash
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
```

## 开源协议

MIT
