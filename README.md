<p align="center">
  <img src="./assets/logo.webp" alt="VentoStack" width="240">
</p>

<h1 align="center">VentoStack 框架</h1>

<p align="center">
  <a href="./README_en.md">English</a>
</p>

<p align="center">
  基于 Bun 运行时的高性能全栈后端框架
</p>

VentoStack 是一个基于 Bun 运行时构建的全栈后端框架，专为高性能和极致开发体验而设计。它遵循函数式优先的设计原则——无 class、无装饰器、显式依赖注入。

## 包总览（npm）

VentoStack 的全部能力以 `@ventostack/*` 系列包发布到 npm，共 **23 个包**，分为「框架层」与「平台层」两层，可按需组合、按场景选包。框架层提供与业务无关的通用能力；平台层提供可直接组合的业务模块，由 `@ventostack/boot` 统一装配。

### 框架层（12 个）

框架层全部基于 Bun 原生 API 实现，不依赖任何上层能力包：

| 包名 | 核心能力 | 依赖 |
|---|---|---|
| `@ventostack/core` | HTTP 路由、Context、中间件、错误处理、生命周期、配置管理、Schema 校验、安全中间件（CORS/CSRF/SSRF/XSS/HMAC/上传/IP 过滤/限流）、WebSocket/RPC/gRPC | 无 |
| `@ventostack/database` | 类型安全查询构建器、迁移、Seed、事务、连接池、读写分离、关系定义、Schema 差异、租户隔离 | core |
| `@ventostack/cache` | 统一缓存接口、Redis/内存适配器、L1/L2 多级缓存、分布式锁、TTL 抖动 | core |
| `@ventostack/events` | 事件总线、消息队列、延迟队列、Saga/TCC、本地与分布式调度 | core |
| `@ventostack/observability` | 结构化日志（自动脱敏）、Prometheus 指标、OpenTelemetry 追踪、健康检查、审计日志（哈希链） | core |
| `@ventostack/openapi` | OpenAPI 3.1 文档生成、请求校验、Swagger UI / Scalar UI、API 差异分析 | core |
| `@ventostack/testing` | 测试应用/客户端、Fixture、数据 Factory、事务隔离、安全基线回归套件 | core |
| `@ventostack/webhook` | Webhook 入站/出站、HMAC/RSA-SHA256 签名校验、时间戳防重放、指数退避重试 | core |
| `@ventostack/cli` | 函数式 CLI、项目脚手架（`create`）、代码生成、迁移命令、安全密码生成 | core, database |
| `@ventostack/file2md` | 办公文档转 Markdown（docx/pdf/xlsx/pptx/epub）、MIME 识别、ZIP 安全读取、OCR 接口 | 无（第三方：liteparse） |
| `@ventostack/ai` | LLM 网关（多 Provider）、Agent Loop、Tool Registry、MCP Server、Session/Memory、Skill、RAG、沙箱执行、Token 预算 | core, database, cache, events, observability, file2md |
| `@ventostack/vite-bridge` | 后端与 Vite 开发服务器的桥接，全栈本地开发体验 | core |

### 平台层（11 个）

平台层是完整的业务模块，遵循统一的 Module 结构（models/services/routes/migrations），通过 `@ventostack/boot` 按开关装配：

| 包名 | 核心能力 | 依赖 |
|---|---|---|
| `@ventostack/auth` | JWT（算法白名单）、Session（内存/Redis）、API Key、RBAC/ABAC、策略引擎、行级数据过滤、TOTP、OAuth | core, database, cache |
| `@ventostack/system` | 用户、角色、菜单、部门、岗位、字典、配置、公告、操作日志、登录/MFA/Passkey | core, database, cache, auth, events, observability |
| `@ventostack/boot` | `createPlatform()` 组合入口，集中声明基础设施并按模块开关装配平台能力 | 全部平台包 |
| `@ventostack/gen` | 数据库表导入、Model/Service/Routes/Types/测试代码生成 | core, database, auth |
| `@ventostack/i18n` | Locale/Message 管理、运行时翻译、默认与回退语言策略 | core, database, auth |
| `@ventostack/monitor` | 服务器/Redis/数据源/健康状态/在线用户监控 | core, database, auth, observability |
| `@ventostack/notification` | 通知模板、站内信/SMTP/SMS/Webhook 多通道投递、已读状态 | core, database, auth, observability |
| `@ventostack/oss` | 对象存储（本地/S3 适配器）、上传下载删除、签名 URL、路径遍历防护 | core, database, auth |
| `@ventostack/scheduler` | 持久化定时任务、Cron 管理、执行日志、手动触发 | core, database, auth, events |
| `@ventostack/workflow` | 流程定义与图校验、串行/会签/或签/比例审批、驳回/转交/加签/撤回 | core, database, auth, events |
| `@ventostack/integration` | 第三方回调签名验证（Stripe/GitHub/DingTalk/Slack/Shopify/微信支付/支付宝） | webhook |

### 按应用场景选包

| 场景 | 推荐包组合 |
|---|---|
| 纯 HTTP API 服务 | `@ventostack/core` |
| API + 数据库（CRUD） | `core` + `database` |
| 需要缓存/限流/分布式锁 | `core` + `cache` |
| 需要登录与权限控制 | `auth` + `database` + `cache` |
| 需要后台管理系统（用户/角色/菜单） | `boot` + `system` + `auth` |
| 需要事件驱动 / 异步任务 | `events` |
| 需要定时任务 | `scheduler` + `events` |
| 需要监控告警 / 审计 | `observability` |
| 需要对外 API 契约文档 | `openapi` |
| 需要接收第三方回调（支付等） | `webhook` + `integration` |
| 需要 AI Agent / RAG / MCP | `ai` + `file2md` + `database` + `cache` |
| 需要文件上传 / 对象存储 | `oss` |
| 需要站内信 / 邮件 / 短信通知 | `notification` |
| 需要审批工作流 | `workflow` |
| 需要代码生成（表 → CRUD） | `gen` |
| 需要国际化 | `i18n` |
| 需要服务器/缓存监控面板 | `monitor` |
| 需要本地前后端联动开发 | `vite-bridge` |
| 需要脚手架初始化项目 | `cli` |
| 需要测试工具链 | `testing` |

> 包依赖关系遵循单向分层：框架层不依赖平台层，平台层只依赖框架层。新增依赖包时必须评估安全边界（见上文「发布流程」与 `docs/` 中的安全规范）。

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
VentoStack/
  apps/
    example/          - 示例应用
    docs/             - 文档站点（Astro Starlight）
    admin/            - 管理后台（api 后端 + web 前端）
  packages/
    framework/        - 框架层（零第三方运行时依赖，发布到 npm）
      core/           - 核心 HTTP 框架
      database/       - 数据库层
      cache/          - 缓存层
      events/         - 事件系统
      observability/  - 指标、追踪、日志
      openapi/        - OpenAPI 文档生成
      testing/        - 测试工具
      webhook/        - Webhook 收发与签名校验
      ai/             - AI 引擎
      file2md/        - 文件转 Markdown
      cli/            - CLI 工具
      vite-bridge/    - Vite 开发桥接
    platform/         - 平台层（业务模块，发布到 npm）
      auth/           - 认证授权（JWT/RBAC/ABAC/TOTP/OAuth/Session）
      system/         - 系统管理（用户/角色/菜单/字典等）
      boot/           - createPlatform() 聚合器
      gen/            - 代码生成
      i18n/           - 国际化
      monitor/        - 系统监控
      notification/   - 通知中心
      oss/            - 对象存储
      scheduler/      - 定时任务
      workflow/       - 审批工作流
      integration/    - 第三方集成
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
