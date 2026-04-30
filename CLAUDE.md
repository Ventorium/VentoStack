# VentoStack — Bun 全栈框架

> 成为 Bun 生态中最完整、最工程化、默认安全的全栈框架。
>
> 当前阶段：优先把后端核心层、数据层、认证授权、安全基线与工程化能力打牢；前端能力先定义边界与契约，不反向绑死后端架构。

---

## 1. Project Positioning

VentoStack 是基于 Bun 运行时构建的全栈框架，但当前研发重心明确放在后端基础设施。

当前阶段目标：
- 极致利用 Bun 原生能力：HTTP、SQL、Redis、Worker、构建、测试
- 100% 类型安全，避免运行时反射与隐式依赖
- 无 class、无 DI 容器、显式依赖注入、函数式优先
- 默认安全、默认可审计、默认可测试、默认可观测
- 为后续前端集成预留稳定契约：OpenAPI、类型生成、认证会话、BFF/SSR 适配

当前阶段非目标：
- 不做 Node-first 兼容层
- 不引入 Express/Fastify/Koa 风格的重量级抽象
- 不为了"像 Spring/Nest"而引入 class、装饰器反射或容器定位

---

## 2. Architecture

### 分层模型

```
┌────────────────────────────────────────────────────┐
│ Apps / CLI / OpenAPI / AI / Testing / Future Web  │  ← 接入层
├────────────────────────────────────────────────────┤
│ Auth / Cache / Events / Observability / Policy    │  ← 能力层
├────────────────────────────────────────────────────┤
│ Database / Queue / Storage / Scheduler            │  ← 数据与基础设施层
├────────────────────────────────────────────────────┤
│ Core (Router / Context / Middleware / Lifecycle)  │  ← 核心框架层
├────────────────────────────────────────────────────┤
│ Bun Runtime (serve/sql/redis/worker/build/test)   │  ← 运行时层
└────────────────────────────────────────────────────┘
```

### 信任边界

所有设计、实现和评审都必须显式考虑以下边界：

1. Edge Boundary：浏览器、移动端、Webhook 调用方、第三方 API、反向代理
2. App Boundary：Router、Middleware、Handler、Validation、Context
3. Data Boundary：数据库、Redis、对象存储、队列、定时任务
4. Control Boundary：CLI、迁移、代码生成、OpenAPI、管理接口
5. AI Boundary：Tool Registry、Prompt、Memory、Worker、审批流
6. Runtime Boundary：容器、宿主机、Kubernetes、CI/CD、供应链

规则：跨边界传入的数据默认不可信，必须显式校验、约束、审计。

### 模块边界

| Package | 职责 | 依赖约束 |
|---------|------|----------|
| core | HTTP 路由、Context、中间件、错误处理、生命周期 | 不依赖上层能力包 |
| database | ORM、迁移、事务、连接策略 | 只依赖 core |
| cache | Redis 封装、缓存策略、分布式锁 | 只依赖 core |
| auth | JWT、Session、API Key、权限校验 | 依赖 core、database、cache |
| events | 事件总线、任务调度、异步处理 | 依赖 core |
| observability | 日志、指标、链路追踪、审计 | 依赖 core |
| openapi | 文档与契约生成 | 依赖 core |
| ai | Tool 调用、Worker 隔离、审批与审计 | 依赖 core、auth、observability |
| cli | 脚手架、构建、迁移、生成命令 | 可依赖所有包 |
| testing | 测试工具、Fixture、测试容器与隔离封装 | 依赖 core 与目标包 |

---

## 3. Bun-First Tech Stack

### 优先级

1. Bun 内置 API
2. Web 标准 API
3. Bun 的 Node 兼容 API
4. 第三方包

### 核心选型

| 能力 | 首选 | 明确约束 |
|------|------|----------|
| HTTP | Bun.serve() | 不引入 Express/Fastify/Koa |
| SQL | Bun.sql + 标签模板 | 不引入 pg/mysql2 作为主路径 |
| Redis | Bun 原生 Redis 能力 | 不引入 ioredis 作为默认方案 |
| 密码哈希 | Bun.password | 不引入 bcrypt/argon2 包 |
| 加密签名 | crypto.subtle / Bun.CryptoHasher / node:crypto 兼容层 | 算法白名单、禁止弱算法 |
| 文件 I/O | Bun.file() / Bun.write() | 不引入 fs-extra 作为默认方案 |
| Shell / 子进程 | $ from bun / Bun.spawn() | 避免 child_process 风格抽象 |
| 测试 | bun:test | 不引入 Jest/Vitest |
| 构建 | bun build | 不引入 esbuild/rollup 作为默认构建链 |

### 自研组件

| 组件 | 原因 |
|------|------|
| Router | Bun 原生路由之上补齐分组、中间件、元数据、编译期类型推导 |
| ORM | 基于 Bun.sql 标签模板，编译期生成类型，零运行时反射 |
| Auth | 需要与框架生命周期深度集成，且安全策略必须可审计 |
| Cache | 需要与路由/上下文生命周期联动，支持多级缓存策略 |

---

## 4. Coding Standards

### 4.1 类型安全

- 所有公共 API 必须有显式返回类型
- 禁止使用 `any`，特殊情况用 `unknown` + 窄化
- 泛型必须有约束，不能无边界
- 配置对象必须定义接口，不能 inline 推断

### 4.2 函数式优先

- 优先纯函数，副作用显式标记
- 用高阶函数组合替代 class 继承
- Context 通过参数显式传递，不隐式挂载到全局
- 异步用 `async/await`，不用回调风格

### 4.3 错误处理

- 所有可能失败的异步操作必须处理错误
- 自定义错误类必须包含 `code` 和 `status` 字段
- 错误链必须保留原始错误，不吞掉堆栈
- 对外暴露的错误信息必须脱敏

### 4.4 命名与结构

- 文件名用 kebab-case：`user-service.ts`
- 函数名用 camelCase，常量用 UPPER_SNAKE_CASE
- 测试文件与被测文件同目录，后缀 `.test.ts`
- 每个文件只做一件事，行数控制在 300 行以内

---

## 5. Security

### 5.1 输入校验

- 所有外部输入必须经 Schema 校验（Zod / Valibot）
- 拒绝未知字段，不静默忽略
- 字符串长度、数组大小、数字范围必须有上限
- 文件上传限制类型、大小、扫描恶意内容

### 5.2 认证与授权

- JWT 必须配置算法白名单，禁止 `none` / `HS256` 用于非对称场景
- Cookie 必须 `HttpOnly` + `Secure` + `SameSite=Strict`
- API Key 必须哈希存储，不存明文
- 权限检查在 Handler 入口统一做，不在业务逻辑里分散判断
- 多租户场景必须强制注入 tenant_id，不能依赖前端传递

### 5.3 数据访问

- SQL 必须用参数化查询，禁止字符串拼接
- ORM 的 raw query 必须有审计日志和审批流
- 缓存 key、对象存储路径、队列名必须包含租户 namespace
- 数据库连接必须按环境隔离，禁止生产环境直接连开发库

### 5.4 通信安全

- 生产环境强制 HTTPS，HSTS 头配置
- CORS 白名单精确匹配，禁止通配符
- 内部服务间通信必须 mTLS 或签名校验
- Webhook 必须验证签名和时间戳防重放

### 5.5 可观测与信息泄露

- 生产环境不返回堆栈信息、SQL 细节、内部拓扑、依赖版本
- 默认脱敏字段至少包含：password、token、secret、key、cookie、authorization、phone、email、idcard、银行卡号
- 默认不记录完整请求体；确需记录时必须按字段白名单采集
- /docs、/openapi.json、/metrics、/debug、/ready 等端点必须按环境或权限控制暴露范围
- 审计日志记录谁、在何时、对什么资源做了什么操作以及结果，但不能泄露敏感载荷

### 5.6 AI / Tool 安全

- 所有 Tool 输入必须做 Schema 校验，必要时对输出同样做结构校验
- 只允许显式注册的 Tool；禁止任意 shell、任意文件访问、任意 SQL
- AI Worker 必须具备超时、内存、CPU、文件系统、网络出站约束
- 敏感操作默认需要人工审批，不允许模型自批准
- 每次 Tool 调用都必须有审计记录：发起者、参数摘要、结果摘要、耗时、审批链
- Prompt、Memory、RAG 文档视为不可信输入，避免 prompt injection 直接穿透到执行面

### 5.7 供应链安全

- bun.lock 必须提交到仓库并参与评审
- 第三方依赖默认 pin 版本，禁止无审查的宽松升级
- 新增依赖必须说明：为什么 Bun 内置能力不够、替代方案是什么、安全边界是什么
- 安装脚本、postinstall、动态下载二进制必须单独评估
- 构建链需支持依赖漏洞扫描与产物溯源

---

## 6. Runtime Isolation And Deployment

容器与集群部署默认基线：

- 非 root 运行
- 根文件系统只读
- allowPrivilegeEscalation=false
- drop ALL Linux capabilities，按需最小增补
- seccomp 使用 RuntimeDefault 或更严格策略
- 仅挂载必要的可写目录，例如 /tmp
- 显式配置 CPU / memory request 与 limit，避免资源耗尽拖垮节点
- 默认最小 ServiceAccount 权限
- 使用 NetworkPolicy 限制东西向与南北向流量
- 仅信任配置过的反向代理 IP/CIDR，不能盲信 X-Forwarded-* 头
- readiness / liveness / startup probe 分离，优雅关闭期间先摘流量再停服务

运行时规则：

- 所有对外 header 推断都必须有 trusted proxy 前提
- 不能把宿主机、容器、Kubernetes 当成可信环境
- 管理端口、调试端口、内部指标端口与业务端口必须分离

---

## 7. Fullstack Direction

项目目标是全栈，但当前不急于实现重前端抽象。后续全栈能力应围绕后端契约自然生长：

- 从路由元数据 / OpenAPI 生成类型安全客户端
- 提供服务端 session / token 与前端 SDK 的统一契约
- 支持 BFF、SSR、Streaming、Server Action 等接入层适配
- 复用同一套 schema 做服务端校验与前端表单校验
- 支持后端事件驱动的缓存失效与前端数据同步接口

原则：先把后端协议、权限模型和安全边界设计稳定，再决定前端 API 形态。

---

## 8. Testing And Verification

### 测试框架

- 使用 bun:test
- 测试文件命名：*.test.ts

### 测试要求

- 每个公共函数必须有单元测试
- 每个 HTTP 端点必须有集成测试
- 认证、授权、租户隔离、签名校验、限流、上传限制必须有安全回归测试
- 数据库测试必须可隔离、可回滚、可重复执行
- 优先 mock 外部服务，不 mock 框架核心模块
- 所有高风险特性在合并前都要经过一次安全审计视角复查

### 交付前检查

- 类型检查通过
- 测试通过
- 安全关键路径有失败用例覆盖
- 默认配置在生产模式下不会以不安全方式启动
- 文档、示例、生成代码与实际行为一致

---

## 9. AI Collaboration Standards

> 融合 Andrej Karpathy 的系统级编程思维与 AI 协作最佳实践。

### 9.1 系统级思考 (Systems Thinking)

- 修改任何代码前，先理解数据流、控制流和依赖关系
- 自顶向下阅读：先读高层接口和类型定义，再深入实现
- 关注不变量：找出代码中始终为真的条件
- 理解错误处理路径：异常路径往往揭示设计意图

### 9.2 第一性原理 (First Principles)

- 质疑每一个抽象层：这个抽象真的必要吗？
- 不盲目遵循框架或模式，从底层理解问题
- 正确性 > 性能 > 优雅：先做对，再做快，最后做漂亮
- 简单优于复杂：能不用设计模式就不用

### 9.3 深度工作规范

- 长时间不间断专注于复杂问题，避免上下文切换
- 理解问题的所有边缘情况后再动手
- 修改前先完整阅读相关文件，不凭猜测编码

### 9.4 代码修改原则

- **最小改动原则**：只做必要的修改，不重构无关代码
- **保持对称性**：添加创建逻辑时，考虑对应的销毁/清理逻辑
- **不破坏现有契约**：接口签名、行为语义保持稳定
- **测试先行**：修改前先理解现有测试覆盖，修改后补充回归测试

### 9.5 调试方法论

- **复现优先**：确保能 100% 复现问题再开始修复
- **二分法定位**：通过注释/条件快速缩小问题范围
- **理解根因**：不满足于表面修复，追溯到根本原因
- **添加回归测试**：确保问题不会再次发生

### 9.6 上下文管理

- 提供足够的上下文，但不要过度
- 明确指定文件的相对路径
- 说明当前的目标和约束条件
- 迭代式开发：从小而具体的任务开始，验证每个步骤后再继续

### 9.7 代码审查思维

- 像攻击者一样思考：这段代码有什么漏洞？（参考 security-review-expert skill）
- 像维护者一样思考：6 个月后我能理解这段代码吗？
- 像用户一样思考：这个 API 易用吗？
- 局部化变更：修改的影响范围应该可控

---

## 10. Directory Structure

```
fullstack/
├── packages/
│   ├── core/
│   ├── database/
│   ├── cache/
│   ├── auth/
│   ├── events/
│   ├── observability/
│   ├── openapi/
│   ├── ai/
│   ├── cli/
│   └── testing/
├── apps/
│   └── example/
├── docs/
├── .agents/skills/
├── bun.lock
├── package.json
└── tsconfig.json
```

---

## 11. Common Commands

```bash
# 安装依赖
bun install

# 开发模式
bun run dev

# 构建
bun run build

# 测试
bun test
bun test --coverage

# 类型检查
bun run typecheck

# 代码检查
bun run lint

# 数据库迁移
bun run migrate

# 生成 OpenAPI 文档
bun run openapi:generate

# 运行 CLI
bun run cli
```

---

## 12. Core Principles

1. **Bun 优先**。Bun 能解决的问题，不引入额外框架。
2. **函数式优先**。避免 class、避免 DI、避免反射。
3. **显式依赖**。依赖关系必须可读、可跳转、可测试。
4. **编译期安全优先于运行时魔法**。
5. **默认安全**。安全不是可选插件，而是默认姿态。
6. **默认可审计**。关键决策、关键操作、关键失败都要留下可用证据。
7. **后端先行**。全栈目标通过稳定后端契约向前演进，而不是前端抽象先行。
8. **系统级思考**。修改前先理解架构、数据流和依赖关系。
9. **第一性原理**。质疑每个抽象的必要性，简单优于复杂。
10. **正确性优先**。先做对，再做快，最后做漂亮。
