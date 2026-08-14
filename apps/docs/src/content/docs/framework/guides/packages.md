---
order: 4
title: 包总览与选型
description: 全部 @ventostack/* npm 包的能力清单与按应用场景的选型指南
---

VentoStack 的全部能力以 `@ventostack/*` 系列包发布到 npm，共 **23 个包**，分为「框架层」与「平台层」两层。框架层提供与业务无关的通用能力；平台层提供可直接组合的业务模块，由 `@ventostack/boot` 统一装配。

依赖关系遵循单向分层：**框架层不依赖平台层，平台层只依赖框架层**。

## 框架层（12 个）

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

## 平台层（11 个）

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

## 按应用场景选包

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

## 安装与使用

所有包均从 npm 安装，使用方式统一为工厂函数：

```bash
bun add @ventostack/core @ventostack/database
```

```typescript
import { createApp, createRouter } from "@ventostack/core";
import { createDatabase, defineModel, column } from "@ventostack/database";

const router = createRouter();
router.get("/", (ctx) => ctx.json({ ok: true }));

const app = createApp({ port: 3000 });
app.use(router);
await app.listen();
```

各包的详细能力与安全边界请参阅对应模块文档（本侧边栏「核心模块 / 数据库模块 / …」），以及仓库中 `packages/framework/*/README.md` 与 `packages/platform/*/README.md`。
