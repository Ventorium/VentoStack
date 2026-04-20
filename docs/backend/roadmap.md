# Aeron 后端框架 — 总体目标文档

> 基于 Bun 运行时的成熟后端开发框架，目标是成为 Bun 生态中最完整、最工程化的全栈后端框架。

---

## 设计原则

1. **约定优于配置** — 提供合理默认值，同时保留逃生舱口
2. **模块化按需加载** — 核心精简，功能可插拔，减少运行时开销
3. **类型安全** — 全链路 TypeScript，从路由到数据库
4. **生产就绪** — 每个模块都为生产环境设计，不区分"开发版"和"生产版"
5. **AI 原生** — 内置 Tool/Command 抽象与权限沙箱，为 Agent 时代做好准备
6. **开发者体验** — CLI 脚手架、热重载、自动文档生成，开箱即用

---

## 一、核心基础层

### 1.1 应用生命周期管理
- [x] 启动/关闭 hooks（`beforeStart` / `afterStart` / `beforeStop`）
- [x] 优雅关闭（Graceful Shutdown）
- [x] 等待存量请求完成后再退出
- [x] 连接池释放
- [x] 多实例协调（配合 k8s readiness / liveness）

### 1.2 路由系统
- [x] 静态路由 / 动态路由（`:id`、`*wildcard`）
- [x] 路由分组与嵌套（`/api/v1/users`）
- [x] RESTful 路由快捷注册（GET/POST/PUT/PATCH/DELETE）
- [x] 路由命名与反向生成 URL
- [x] 路由参数类型约束与正则匹配
- [x] 路由冲突检测与优先级排序
- [x] 支持 WebSocket / SSE 路由

### 1.3 中间件系统
- [x] 全局中间件 / 路由级中间件 / 分组中间件
- [x] 洋葱模型（`before → handler → after`）
- [x] 内置常用中间件：CORS、限流、压缩、日志、鉴权、超时控制
- [x] 中间件链的中断与跳过机制

### 1.4 请求/响应封装
- [x] 统一 `Context` 对象（Request + Response + 元数据）
- [x] Query / Path / Header / Body / Form / File 参数解析
- [x] 自动绑定（JSON / Form → Struct）
- [x] 参数验证（必填、类型、范围、正则、自定义规则）
- [x] 响应统一封装（code/message/data 结构）
- [x] 流式响应、文件下载、重定向
- [x] 内容协商（`Accept` 头自动选择序列化格式）

### 1.5 请求处理管线
- [x] Middleware / Interceptor / Filter 三层模型
- [x] 支持横切关注点：logging、auth、rate limit、tracing
- [x] 全局异常统一处理（Global Exception Handler）

### 1.6 多协议支持
- [x] HTTP（REST）
- [x] gRPC（强类型）
- [x] WebSocket（实时）
- [x] 内部 RPC（service-to-service）

---

## 二、配置系统

### 2.1 多来源配置
- [x] 环境变量（`.env`）
- [x] 配置文件（YAML）
- [x] 命令行参数

### 2.2 环境管理
- [x] 分环境配置（dev / test / staging / prod）
- [x] 配置优先级覆盖（配置文件 < 环境变量 < 命令行参数）
- [x] 动态热更新（watch + callback，不重启生效）

### 2.3 安全与类型
- [x] 类型安全（Schema + Validation）
- [x] 敏感信息管理（Secret / Vault 集成）
- [x] 敏感配置加密存储

---

## 三、模块化系统

### 3.1 模块架构
- [x] 模块隔离
- [x] 模块依赖图
- [x] 插件化加载（Plugin System）
- [x] 按需加载（Feature Toggle）

---

## 四、数据访问层

### 4.1 ORM / 数据库抽象
- [x] 链式查询构造器（Where / Select / Join / Group / Having / Order / Limit）
- [x] CRUD 基础操作封装
- [x] 事务支持（嵌套事务 / Savepoint）
- [x] 批量插入 / 更新
- [x] 软删除
- [x] 乐观锁（版本号/时间戳）
- [x] 关联关系：一对一、一对多、多对多、Eager Loading / Lazy Loading
- [x] 原生 SQL 支持与防注入
- [x] 多数据库类型驱动（MySQL / PostgreSQL / SQLite / MSSQL）
- [x] 读写分离 / 多数据源切换
- [x] 连接池管理（最大连接数、空闲连接、超时回收）

### 4.2 数据库迁移
- [x] 版本化 Migration 文件（`up` / `down`）
- [x] 自动检测 Schema 差异
- [x] Seed 数据填充
- [x] 迁移状态记录与回滚

### 4.3 缓存系统
- [x] 统一缓存接口（Redis）
- [x] 设置 TTL / 永久缓存
- [x] 标签缓存（按 tag 批量失效）
- [x] 缓存穿透防护（singleflight / 空值缓存）
- [x] 缓存雪崩防护（随机 TTL 抖动）
- [x] 分布式锁（基于 Redis `SET NX EX`）
- [x] 二级缓存（本地 L1 + 远端 L2）
- [x] Cache Aside / Write Through 策略
- [x] 分布式一致性（避免 cache stampede）

### 4.4 事务管理
- [x] 本地事务（DB Transaction）
- [x] 分布式事务（Saga / TCC）
- [x] 自动回滚机制

---

## 五、安全体系

### 5.1 认证（Authentication）
- [x] Session / Cookie 认证
- [x] JWT 生成、解析、刷新、黑名单吊销
- [x] OAuth2.0 / OIDC 集成（第三方登录）
- [x] API Key 认证
- [x] 多因素认证（TOTP / SMS）
- [x] 多端登录支持

### 5.2 授权（Authorization）
- [x] RBAC（角色-权限-资源）
- [x] ABAC（基于属性的访问控制）
- [x] 策略引擎（Casbin 等）
- [x] 资源级权限细控（数据行过滤）

### 5.3 安全防护
- [x] SQL 注入防护（参数化查询）
- [x] XSS 过滤
- [x] CSRF Token 验证
- [x] 请求签名验证（HMAC）
- [x] 敏感数据加密（AES / RSA / bcrypt 密码哈希）
- [x] 请求频率限制（IP / 用户 / 接口维度，Token Bucket / Leaky Bucket）
- [x] IP 黑白名单
- [x] HTTPS 强制与 HSTS
- [x] 输入校验（强制）

---

## 六、异步与任务系统

### 6.1 消息队列支持（低优先级）
- [x] Kafka / RabbitMQ / NATS / RocketMQ 适配
- [x] Producer / Consumer 抽象
- [x] Retry / Dead Letter Queue
- [x] 消息幂等性支持
- [x] 可靠投递（持久化 + ACK 确认）
- [x] 优先级队列

### 6.2 后台任务系统
- [x] Cron Job（Cron 表达式支持）
- [x] 延迟队列
- [x] 分布式任务调度（防重复执行，抢锁机制）
- [x] 任务可观测（状态 / retry / logs）
- [x] 任务超时与重试策略
- [x] 优雅停止（正在执行的任务不被强杀）

### 6.3 事件系统
- [x] 同步 / 异步事件分发
- [x] 监听器注册（支持多监听者）
- [x] 事件队列化处理
- [x] 领域事件（Domain Events）
- [x] 事件溯源支持

---

## 七、可观测性

### 7.1 日志系统
- [x] 分级日志（DEBUG / INFO / WARN / ERROR / FATAL）
- [x] 结构化日志（JSON 格式）
- [x] TraceID / SpanID 自动注入
- [x] 日志文件轮转（按大小 / 日期）
- [x] 异步写入（避免阻塞业务）
- [x] 敏感字段脱敏（手机号、身份证、密码）
- [x] 多输出目标（控制台 + 文件 + 远程）
- [x] Log Hook（发送到victoria-logs）

### 7.2 链路追踪
- [x] 集成 OpenTelemetry（分布式 Trace）
- [x] 自动注入 TraceContext 到日志
- [x] 跨服务 Context 传播（W3C TraceContext / B3）
- [x] 接入 Jaeger / Zipkin / SkyWalking / Tempo

### 7.3 指标监控
- [x] 暴露 `/metrics` 接口（Prometheus 格式）
- [x] 内置指标：QPS、响应时延（P50/P95/P99）、错误率、连接池状态
- [x] 自定义业务指标注册
- [x] 与 Grafana Dashboard 集成

### 7.4 健康检查
- [x] `/health/live`（存活探针）
- [x] `/health/ready`（就绪探针）
- [x] 各依赖项状态检查（DB / Redis / MQ）
- [x] 对接 Kubernetes 探针

---

## 八、接口与文档

### 8.1 API 文档
- [x] 注解/装饰器自动生成 OpenAPI 3.0 文档
- [x] 在线调试界面（Swagger UI / Redoc）
- [x] 文档版本管理
- [x] 接口变更 Diff

### 8.2 API 版本管理
- [x] URL 版本（`/api/v1/`）
- [x] Header 版本（`Accept: application/vnd.api+json;version=2`）
- [x] 旧版本兼容与废弃通知
- [x] 向后兼容策略

---

## 九、性能与稳定性

### 9.1 高并发能力
- [x] 异步 IO（基于 Bun 原生能力）
- [x] Worker Pool（Bun Worker Threads）
- [x] Backpressure（背压机制）

### 9.2 限流与熔断
- [x] Rate Limiter（Token Bucket / Leaky Bucket）
- [x] Circuit Breaker（熔断）
- [x] Fallback 机制

### 9.3 资源管理
- [x] 连接池（DB / HTTP）
- [x] 内存控制
- [x] GC 优化（Bun 运行时相关调优）

---

## 十、工程化能力

### 10.1 错误处理
- [x] 全局统一异常捕获（Panic Recovery）
- [x] 自定义业务错误码体系
- [x] 错误链（Wrapping / Unwrapping）
- [x] 区分 4xx（客户端错误）与 5xx（服务端错误）
- [x] 错误上报（Sentry / 钉钉告警）

### 10.2 多租户（Multi-tenancy）
- [x] Tenant Isolation
- [x] Tenant-aware Context
- [x] 数据隔离策略

### 10.3 审计日志（Audit Log）
- [x] 谁在什么时候做了什么操作
- [x] 不可篡改
- [x] 查询与导出

---

## 十一、测试能力

### 11.1 测试工具链
- [x] 单元测试：Mock 注入（接口替换），不依赖外部服务
- [x] 集成测试：内置测试服务器（不需要真实启动进程）
- [x] 接口测试：HTTP Client 封装，断言响应
- [x] 数据库测试：事务回滚隔离，测试结束自动清理
- [x] Test Container（数据库隔离）
- [x] 工厂模式造数据（Fixture / Factory）
- [x] 覆盖率报告生成

---

## 十二、部署与运维

### 12.1 优雅启停
- [x] 启动前依赖检查（DB 连通、配置完整性）
- [x] 接收 `SIGTERM` 信号后停止接收新请求
- [x] 等待存量请求处理完毕再退出（可配超时）
- [x] 热重启（不中断连接升级进程）

### 12.2 容器化支持
- [x] 官方提供最小化 Dockerfile
- [x] 多阶段构建减小镜像体积
- [x] 支持非 root 用户运行
- [x] 环境变量配置驱动（12-Factor）
- [x] 健康检查接口标准化

### 12.3 Kubernetes 集成
- [x] 自动配置探针（readiness / liveness）
- [x] Graceful Shutdown 配合 Pod 终止
- [x] 配置注入（ConfigMap / Secret）

### 12.4 灰度发布 / Feature Flag
- [x] 按用户 / 流量切换
- [x] 动态开关功能
- [x] A/B Testing 支持

---

## 十三、开发体验（DX）

### 13.1 CLI 工具
- [x] 项目初始化（scaffold）
- [x] 生成用户密码
- [x] 代码生成（module / controller / service / migration）
- [x] 数据库迁移命令（migrate up/down/status）
- [x] 构建、测试、部署命令封装

### 13.2 热重载
- [x] 文件变更自动 reload
- [x] 保留状态（可选）

---

## 十四、扩展生态

### 14.1 插件系统
- [x] 生命周期 Hooks
- [x] 插件注册机制
- [x] 插件隔离（避免污染）
- [x] 官方插件市场或注册表
- [x] 第三方插件统一接入规范

### 14.2 Hook / Event 机制
- [x] beforeRequest / afterResponse
- [x] 领域事件（Domain Events）
- [x] 自定义 Hook 点暴露

---

## 十五、AI / Agent 能力（核心差异化）

### 15.1 Tool / Command 抽象
- [x] 标准化操作：read / write / exec / query
- [x] Schema 描述（给 LLM 用）
- [x] Tool 注册与发现

### 15.2 权限沙箱
- [x] 限制 AI 可执行的操作
- [x] Command Allowlist
- [x] 操作审计与审批流

### 15.3 上下文系统
- [x] Request Context
- [x] User Context
- [x] Memory（短期 / 长期）
- [x] 多轮对话状态管理

### 15.4 RAG
- [x] 知识库管理：多格式文档解析/embedding/thunk
- [x] Agent管理：配置系统提示词，入参定义，记忆

---

## 实施阶段规划

### Phase 1 — 核心基石
> 路由、中间件、配置、生命周期、CLI 脚手架

### Phase 2 — 数据层
> ORM、数据库迁移、缓存、事务管理

### Phase 3 — 安全体系
> 认证、授权、安全防护

### Phase 4 — 异步与可观测
> 消息队列、定时任务、日志、链路追踪、指标监控

### Phase 5 — 微服务与工程化
> 服务注册、负载均衡、RPC、API 文档、多租户、审计日志

### Phase 6 — AI 与扩展
> Tool 抽象、权限沙箱、上下文系统、插件市场

### Phase 7 — 生产就绪
> 容器化、K8s 集成、灰度发布、性能调优、全链路测试

---

> **核心原则**：以上功能不必全部自研，但框架必须提供**清晰的扩展点**和**官方推荐集成方案**，让开发者能以最低成本接入。缺失的功能比设计不良的功能危害更小。
