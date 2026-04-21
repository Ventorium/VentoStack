# Aeron 文档站建设任务追踪

## 文档站基础设施

- [x] 创建 Starlight 文档站（`apps/docs/`）
- [x] 配置中文为默认语言
- [x] 配置侧边栏导航结构
- [x] 首页（index.mdx）

## 核心模块（@aeron/core）

- [x] 快速开始指南
- [x] HTTP 服务器与应用创建（`createApp`）
- [x] 路由系统（`createRouter`）
- [x] 中间件机制（`compose`、`Middleware`）
- [x] 请求上下文（`Context`）
- [x] 错误处理（`AeronError`、`NotFoundError` 等）
- [x] 配置管理（`createConfig`、`loadConfig`、YAML 支持）
- [x] 生命周期钩子（`createLifecycle`）
- [x] 健康检查（`createHealthCheck`）
- [x] 限流（`createRateLimiter`）
- [x] 缓存控制头（`createCacheControl`）
- [x] A/B 测试（`createABTestManager`）
- [x] 热重启（`createHotRestart`）
- [x] 内存管理（`createMemoryController`）
- [x] 插件系统（`createPluginRegistry`、`createPluginSandbox`）
- [x] 12-Factor 配置（`loadTwelveFactorConfig`）
- [x] gRPC / RPC 路由（`createGRPCRouter`、`createRPCRouter`）
- [x] CORS、静态文件服务

## 数据库模块（@aeron/database）

- [x] 连接池（`createConnectionPool`）
- [x] 查询构建器（`createQueryBuilder`）
- [x] 迁移系统（`createMigrator`）
- [x] 事务管理（`createTransactionManager`）
- [x] 分页与游标（`createPaginator`）
- [x] 多租户支持（`createTenantManager`）
- [x] 全文搜索（`createFullTextSearch`）

## 缓存模块（@aeron/cache）

- [x] 内存适配器（`createMemoryAdapter`）
- [x] Redis 适配器（`createRedisAdapter`）
- [x] 缓存层（`createCache`）
- [x] 多级缓存（`createMultiLevelCache`）

## 认证模块（@aeron/auth）

- [x] JWT 认证（`createJWT`）
- [x] RBAC 权限控制（`createRBAC`）
- [x] OAuth 2.0（`createOAuthProvider`）
- [x] 会话管理（`createSessionManager`）
- [x] MFA 多因素认证（`createMFAManager`）
- [x] API 密钥管理（`createAPIKeyManager`）
- [x] Token 刷新（`createTokenRefresher`）
- [x] 多设备管理（`createMultiDeviceManager`）
- [x] 策略引擎（`createPolicyEngine`）
- [x] 行级过滤（`createRowFilter`）

## 事件模块（@aeron/events）

- [x] 事件总线（`createEventBus`）
- [x] 事件定义（`defineEvent`）
- [x] 消息队列适配器（`createMemoryMQAdapter`）
- [x] 事件溯源（`createEventStore`）
- [x] 延迟任务（`createScheduler`）
- [x] Webhook（`createWebhookManager`）

## 可观测性模块（@aeron/observability）

- [x] 结构化日志（`createLogger`）
- [x] 指标收集（`createMetricsCollector`）
- [x] 分布式追踪（`createTracer`）
- [x] 告警系统（`createAlertManager`）
- [x] 日志采样与聚合

## OpenAPI 模块（@aeron/openapi）

- [x] Schema 生成（`defineSchema`、`generateOpenAPISpec`）
- [x] 请求验证（`createRequestValidator`）
- [x] 文档 UI 集成

## 测试工具（@aeron/testing）

- [x] 测试应用（`createTestApp`）
- [x] HTTP 请求 Mock（`createMockRequest`）
- [x] 测试辅助（`waitFor`、`expectJSON`）

## AI 模块（@aeron/ai）

- [x] LLM 适配器（`createLLMAdapter`）
- [x] RAG 检索增强（`createRAGPipeline`）
- [x] 流式响应（`createStreamingHandler`）
- [x] 函数调用（`createFunctionCalling`）
- [x] Embedding（`createEmbeddingAdapter`）

## CLI 工具（@aeron/cli）

- [x] 项目脚手架
- [x] 代码生成器
- [x] 迁移命令

## 完成统计

文档页面总计: 55 页
已完成: 55 页
进度: 100%
