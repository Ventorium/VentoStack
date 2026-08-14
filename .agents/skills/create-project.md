---
name: create-project
description: |
  使用 VentoStack 创建全新项目。当需要从零搭建一个基于 @ventostack/* npm 包的
  Bun 后端/全栈项目时调用。涵盖包选型（按应用场景选包）、项目脚手架、基础应用、
  数据库/缓存/认证接入、平台模块装配（createPlatform）与部署清单。
  适用于 Claude Code / Codex 等 AI 工具的项目初始化任务。
---

# Create Project — 使用 VentoStack 创建新项目

## When To Use

- 从零创建一个新的 Bun 后端 / 全栈项目
- 基于 VentoStack 搭建 API 服务、管理后台、AI 应用等
- 需要为具体业务场景选择 @ventostack/* 包组合

## 第 0 步：确认环境与定位

前置条件：

```bash
bun --version  # 需要 >= 1.0.0
```

先明确项目定位，再决定选包：

| 项目类型 | 核心组合 |
|---|---|
| 纯 HTTP API | `@ventostack/core` |
| API + 数据库 CRUD | `core` + `database` |
| 需要登录权限 | `auth` + `database` + `cache` |
| 管理后台（用户/角色/菜单） | `boot` + `system` + `auth` |
| AI Agent / RAG / MCP | `ai` + `file2md` + `database` + `cache` |

## 第 1 步：包选型（按场景）

完整的 23 个包清单与选型表见根目录 `README.md`「包总览（npm）」。要点：

- **框架层 12 个包**：`core`（HTTP/路由/中间件/安全）、`database`、`cache`、`events`、`observability`、`openapi`、`testing`、`webhook`、`cli`、`file2md`、`ai`、`vite-bridge`
- **平台层 11 个包**：`auth`、`system`、`boot`、`gen`、`i18n`、`monitor`、`notification`、`oss`、`scheduler`、`workflow`、`integration`
- **分层约束**：框架层不依赖平台层；平台层只依赖框架层。选包时遵循该单向依赖。
- **最小化原则**：只装当前需要的包，后续按需 `bun add` 扩展。

## 第 2 步：脚手架初始化

### 方式 A：使用 @ventostack/cli（推荐）

```bash
bunx @ventostack/cli create --name my-app --template minimal
# 或完整模板（含 src/routes、src/services、tests 目录）
bunx @ventostack/cli create --name my-app --template full
cd my-app
bun install
bun run dev
```

生成的模板包含 `package.json`、`tsconfig.json`（strict）、`src/index.ts`（含 `/` 与 `/health` 路由）、`.gitignore`、`.env.example`、`Dockerfile`。

### 方式 B：手动初始化

```bash
mkdir my-app && cd my-app && bun init -y
bun add @ventostack/core
```

## 第 3 步：基础应用

`src/index.ts`：

```typescript
import { createApp, createRouter } from "@ventostack/core";

const router = createRouter();

router.get("/", async (ctx) => {
  return ctx.json({ message: "Hello, VentoStack!" });
});

const app = createApp({ port: 3000 });
app.use(router);
await app.listen();
```

启动：`bun run --watch src/index.ts`（开发）或 `bun run src/index.ts`（生产）。

## 第 4 步：按需接入能力

### 数据库

```bash
bun add @ventostack/database
```

```typescript
import { createDatabase, defineModel, column } from "@ventostack/database";

const UserModel = defineModel("users", {
  id: column.bigint({ primary: true, autoIncrement: true }),
  email: column.varchar({ length: 255 }),
});

const db = createDatabase({ url: process.env.DATABASE_URL! });

const users = await db.query(UserModel).select("id", "email").where("active", "=", true).limit(10).list();
```

- 多租户必须调用 `.withTenant(tenantId)`，不能依赖前端传 `tenant_id`
- SQL 必须参数化，禁止字符串拼接
- 迁移/Seed/事务能力同包提供

### 缓存

```bash
bun add @ventostack/cache
```

```typescript
import { createCache, createMemoryAdapter } from "@ventostack/cache";

const cache = createCache(createMemoryAdapter()); // 生产换 createRedisAdapter
await cache.set("key", { data: "value" }, { ttl: 300 });
```

### 认证授权

```bash
bun add @ventostack/auth
```

```typescript
import { createJWT, createRBAC } from "@ventostack/auth";

const jwt = createJWT({ secret: process.env.JWT_SECRET!, algorithm: "HS256" });
const rbac = createRBAC();
// JWT 只允许 HS256/HS384/HS512；生产 Session 用 createRedisSessionStore
```

### 平台模块装配（管理后台场景）

```bash
bun add @ventostack/boot @ventostack/system @ventostack/auth
```

```typescript
import { createPlatform } from "@ventostack/boot";

const platform = createPlatform({
  // 显式传入基础设施：db、cache、rbac 等
  // 模块开关：system: true, oss: false, workflow: false ...
});
```

- `boot` 只负责装配，不隐藏基础设施；应用入口仍要自己创建 db/cache 并显式传入
- 模块开关在 `PlatformConfig` 中按需开启，避免装多余能力

## 第 5 步：环境变量（.env）

```bash
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
JWT_SECRET=change-me-in-production
```

生产环境强制要求：`JWT_SECRET` 至少 32 字符、`NODE_ENV=production`（不返回堆栈）、HTTPS + HSTS。

## 第 6 步：测试与交付前检查

```bash
bun test            # 每个公共函数必须有单测，每个端点必须有集成测试
bunx tsc --noEmit   # 类型检查必须通过
```

交付清单：

- [ ] 类型检查通过（strict 模式，无 `any`）
- [ ] 测试通过（含安全关键路径的失败用例）
- [ ] 生产模式下不会以不安全方式启动（无明文密钥、无堆栈泄露）
- [ ] 环境变量与 `.env.example` 一致
- [ ] 部署采用非 root + 只读根文件系统 + 最小权限（参考 Dockerfile 模板）

## 常用命令速查

```bash
bun add @ventostack/core @ventostack/database   # 安装包
bunx @ventostack/cli create -n my-app -t full   # 脚手架
bun run --watch src/index.ts                     # 开发
bun test                                         # 测试
bunx tsc --noEmit                                # 类型检查
```

## 参考

- 包清单与选型：根目录 `README.md`
- 详细文档：`apps/docs/src/content/docs/framework/guides/`（入门指南、包总览、项目结构）
- 每个包的能力与安全边界：`packages/framework/*/README.md`、`packages/platform/*/README.md`
