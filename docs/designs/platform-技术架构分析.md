# VentoStack 企业级平台能力 — 技术架构分析

> 分析当前框架基础能力，规划企业级平台层的架构设计、包拆分方案与实施路径。

---

## 一、现状盘点：已有能力与缺口

### 1.1 已有能力（可直接作为平台层底座）

| 包名 | 核心能力 | 企业级复用评估 |
|------|---------|---------------|
| `@ventostack/core` | 路由、中间件洋葱模型、Context、14 个内置中间件（CORS/CSRF/限流/SSRF/XSS/上传/HMAC/IP 过滤等）、Plugin 系统、Feature Toggle、A/B Testing（灰度/Canary）、多租户中间件 | **完备**，平台层直接复用 |
| `@ventostack/database` | ORM（defineModel + 类型安全 QueryBuilder）、多驱动适配（PG/MySQL/SQLite/MSSQL）、迁移、事务（嵌套 SAVEPOINT）、读写分离、Schema Diff、乐观锁、软删除 | **完备**，平台层直接复用 |
| `@ventostack/cache` | 内存/Redis 双层缓存、分布式锁、Singleflight、缓存雪崩防护（TTL Jitter）、Tag 缓存 | **完备**，平台层直接复用 |
| `@ventostack/auth` | JWT（Web Crypto，仅 HMAC 系）、Refresh Token 轮换、Session（内存/Redis）、API Key（SHA-256 哈希存储）、RBAC、ABAC、PolicyEngine（Casbin 风格）、行级数据权限（RowFilter → SQL WHERE）、TOTP MFA、OAuth2/OIDC、多设备管理（强踢/溢出策略）、密码哈希（bcrypt） | **引擎完备，缺业务模型**——有权限判定引擎但没有用户/角色/菜单/部门的业务表和 CRUD |
| `@ventostack/events` | EventBus、Cron 调度器、消息队列（内存）、延迟队列、Saga/TCC、领域事件、事件溯源、分布式调度 | **调度引擎完备，缺管理界面** |
| `@ventostack/observability` | 结构化日志、Prometheus 指标、分布式追踪、防篡改审计日志（SHA-256 链）、健康检查、多通道错误上报（Sentry/钉钉/Webhook） | **完备** |
| `@ventostack/openapi` | OpenAPI 3.0 自动生成、Swagger UI / Scalar UI、API 版本管理、API Diff、废弃管理 | **完备** |
| `@ventostack/ai` | Tool Registry + JSON Schema 校验、Sandbox 权限沙箱、RAG 知识库（TF-IDF）、Agent Registry、审批流 | **基础完备** |
| `@ventostack/cli` | 项目脚手架、迁移命令、密码生成 | **完备**，可通过扩展机制增加子命令 |
| `@ventostack/testing` | TestClient、Factory、DB 隔离（事务回滚）、安全测试套件、Fixture | **完备** |

### 1.2 能力缺口总结

| 缺口类别 | 具体缺失 | 说明 |
|----------|---------|------|
| **用户/组织业务模型** | 用户、角色、菜单、部门、岗位的数据库表定义 + CRUD Service + REST API | auth 有权限引擎但没有"用户长什么样"的业务定义 |
| **数据字典** | 字典表 + 字典项缓存 + REST API | 企业后台"下拉选项"基础设施 |
| **系统参数** | 键值对参数表 + 运行时读取 + 缓存 | 比 config.yaml 更动态，后台可改 |
| **通知公告** | 系统公告 CRUD + 发布/撤回 + 已读未读 | 无对应实现 |
| **代码生成器** | 从数据库表结构生成 CRUD 前后端代码 | cli 有 scaffold 但没有"读表 → 生成 CRUD" |
| **在线任务管理** | 任务配置 UI 后端、执行日志持久化、失败告警 | events 有调度引擎但无业务管理 |
| **系统监控面板后端** | 在线用户、服务器状态、缓存状态、数据源监控的 API | observability 有指标采集但无面向管理后台的聚合 API |
| **文件存储服务** | 统一上传、OSS/S3 适配、文件记录管理 | 无对应包 |
| **消息中心** | 站内信、邮件模板、短信模板 | 无对应包 |
| **国际化** | 多语言资源管理、后端动态加载 | 无对应包 |
| **工作流** | 流程设计、审批链、状态机 | 无对应包 |

---

## 二、安全架构审查

> 基于对现有代码的逐文件审查，识别安全风险并提出修复建议。安全是平台层的设计约束，不是事后补丁。

### 2.1 认证与 Token 安全

| 模块 | 现状 | 风险等级 | 问题与建议 |
|------|------|---------|-----------|
| JWT (`auth/jwt.ts`) | HMAC-only 白名单（HS256/384/512），256-bit 最短密钥，`crypto.subtle.verify` 恒定时间比较 | **低风险** | 实现扎实。建议：verify 时增加 `typ: "JWT"` 头部校验 |
| Refresh Token (`auth/token-refresh.ts`) | 已实现轮换（Rotation），每次刷新后旧 JTI 加入吊销集合 | **中风险** | **吊销集合是内存 Set**——进程重启后丢失，多实例间不共享。生产必须换成 Redis 或数据库持久化。另缺少 Token Family 追踪——攻击者窃取 Refresh Token 先于合法用户使用时，系统无法检测到异常并吊销整个 Token 家族 |
| Session (`auth/session.ts`) | 支持 Redis Store，Session ID 用 `crypto.randomUUID()` 生成 | **中风险** | 缺少会话固定防护（权限提升后应重新生成 Session ID）；Redis 中数据为明文 JSON；缺少按 userId 批量销毁接口（admin 踢人需要） |
| 多设备管理 (`auth/multi-device.ts`) | 有 `logoutAll(userId)` 强制登出、设备数限制、溢出策略 | **中风险** | **踢人不联动 Token 吊销**——`logoutAll()` 从设备 Map 移除，但 JWT 仍然有效直到自然过期。必须与 Token 吊销机制联动 |
| API Key (`auth/api-key.ts`) | SHA-256 哈希存储，恒定时间比较 | **低风险** | 缺少 Key 过期机制和元数据（关联用户/租户/过期时间）的强制结构 |
| 密码 (`auth/password.ts`) | bcrypt，cost=10，自动加盐 | **低风险** | cost=10 是 OWASP 下限，建议默认提升到 12；缺少密码策略（最小长度/复杂度/泄露字典检查）；不支持 pepper |
| MFA / TOTP (`auth/totp.ts`) | RFC 6238 正确实现，支持 SHA-256/512 | **中风险** | 缺少重放保护（同一 code 在时间窗口内可重复使用）；缺少恢复码（用户丢失 TOTP 设备后的兜底）；**TOTP 层无限流**——6 位码只有 100 万种可能，暴力破解在机器速度下可行 |
| 登录暴力破解 | **全框架无任何实现** | **高风险** | auth 包内无速率限制、账户锁定、指数退避或尝试次数追踪。**必须在 system 包的登录流程中实现**——结合 core 的 rate-limit 中间件，按 IP + 用户名双维度限流 |

### 2.2 授权与多租户

| 模块 | 现状 | 风险等级 | 问题与建议 |
|------|------|---------|-----------|
| RBAC (`auth/rbac.ts`) | 默认拒绝，精确匹配 | **低风险** | 无角色继承（层级扁平），复杂权限需手动复制。可接受但建议在 system 层封装角色继承逻辑 |
| ABAC (`auth/abac.ts`) | 默认拒绝，Deny 优先于 Allow | **低风险** | 条件函数是任意闭包，无沙箱——恶意或有 Bug 的条件函数可能抛异常或产生意外结果 |
| PolicyEngine (`auth/policy-engine.ts`) | 默认拒绝，Deny 短路 | **中风险** | 通配符 `*` 规则可能过度授权（一条 `subjects: ["*"], resources: ["*"], actions: ["*"], effect: "allow"` 即全局放行）；`matches` 操作符使用 `new RegExp()` 无校验，存在 ReDoS 风险 |
| 多租户中间件 (`core/tenant.ts`) | 四种解析策略（header/subdomain/path/custom） | **高风险** | **仅做解析，不做校验**——客户端可传入任意 tenantId 且不验证用户是否属于该租户。必须增加租户校验 Hook（查库确认用户属于该租户） |

### 2.3 Web 攻击面

| 模块 | 现状 | 风险等级 | 问题与建议 |
|------|------|---------|-----------|
| CSRF (`core/csrf.ts`) | Double-submit Cookie，`HttpOnly + SameSite=Strict`，恒定时间比较 | **中风险** | **缺少 `Secure` 标记**——HTTP 明文下 Token 可被截获；`HttpOnly` 导致 SPA 前端无法读取 Cookie 塞入 Header，需要提供非 HttpOnly 的二次 Token 或专用 API 端点 |
| SSRF (`core/ssrf.ts`) | 屏蔽 loopback/private/link-local/metadata，DNS 解析校验 | **低风险** | DNS 校验与实际 fetch 之间存在 TOCTOU 窗口——攻击者控制 DNS 可在两次请求间切换 IP。高安全场景需 pin 解析后的 IP 直连 |
| 上传 (`core/upload.ts`) | 大小/数量/扩展名/双扩展名/空字节/文件名清洗 | **中风险** | **MIME 类型信任客户端** `file.type`——可被伪造。必须增加 magic-byte / 文件头检测；无病毒扫描 Hook |
| XSS (`core/xss.ts`) | 安全头（CSP/X-Frame-Options/X-Content-Type-Options）+ `escapeHTML` + `detectXSS` 工具 | **中风险** | `detectXSS` 未接入中间件管道（仅导出工具函数）；CSP 默认未设置；`escapeHTML` 不转义反引号（模板字面量上下文风险）；`X-XSS-Protection` 已废弃应移除 |
| HMAC (`core/hmac.ts`) | timestamp + nonce + canonical request，恒定时间比较 | **中风险** | **Nonce 去重是内存 Map**——多实例部署下无法防重放。生产必须换 Redis |
| 限流 (`core/rate-limit.ts`) | 固定窗口，支持内存/Redis 两种 Store，Lua 原子计数 | **低风险** | 默认 `trustProxyHeaders: false` 时 IP 解析为 `"unknown"`——所有客户端共享一个桶。需文档明确配置要求；固定窗口允许边界突发，可考虑增加滑动窗口选项 |

### 2.4 安全风险修复优先级

**必须在平台层上线前修复（P0）**：

1. **Token 吊销持久化**：将 `token-refresh.ts` 的 `revokedJTIs` 从内存 Set 迁移到 Redis/DB。同步改造 session store 增加 `destroyAllByUser(userId)` 接口。
2. **统一踢人链路**：`multi-device.logoutAll()` → 销毁 Session → 吊销所有该用户的 Refresh Token JTI，三个操作必须原子联动。
3. **登录暴力破解防护**：在 system 包的登录流程中，按 IP + 用户名双维度限流，连续失败 N 次后锁定账户并告警。
4. **多租户校验**：tenant 中间件增加 `validateTenant` Hook，校验当前用户是否有权访问解析出的 tenantId。
5. **TOTP 限流 + 重放保护**：system 层对 MFA 验证端点单独限流，并在 TOTP 模块内记录已使用 code 防止时间窗口内重放。

**建议在 P1 阶段修复**：

6. CSRF `Secure` 标记 + SPA 兼容方案
7. 上传 MIME 服务端校验（magic-byte 检测）
8. HMAC / Rate-limit 的分布式 Store 补全（已有的 Redis 路径需成为默认推荐）
9. PolicyEngine ReDoS 防护（正则校验/超时）

---

## 三、架构设计原则

### 3.1 核心原则

1. **框架层不碰业务逻辑**：已有 10 个框架包的职责和 API 边界不变，不向下引入反向依赖。增强只做"暴露已有能力"或"修复安全缺陷"，不做"增加业务语义"。
2. **扩展优于耦合**：平台包通过接口/钩子扩展框架包，而不是直接修改框架包源码。比如 gen 包通过 CLI 的命令注册扩展点新增子命令，而不是在 CLI 包内增加 gen 相关代码。
3. **业务模型与引擎分离**：`auth` 继续负责权限判定引擎，`system` 定义"用户/角色/菜单是什么"并调用 auth 引擎。
4. **可插拔**：每个平台包可独立引入，不强依赖全部平台包。
5. **函数式工厂模式**：与现有框架一致，`createXxxService()` / `createXxxModule()`，无 class、无 DI。
6. **默认安全**：所有平台 API 默认需要认证、默认审计、默认脱敏。
7. **Bun-First**：继续使用 Bun 原生能力，不引入 Express/Koa 生态。

### 3.2 分层模型（升级后）

```
┌─────────────────────────────────────────────────────────────────────┐
│  Apps / 管理后台 / CLI / OpenAPI / AI                               │  ← 接入层
├─────────────────────────────────────────────────────────────────────┤
│  system │ scheduler │ monitor │ gen │ oss │ notification │ ...     │  ← 平台层（packages/platform/）
├─────────────────────────────────────────────────────────────────────┤
│  Auth / Cache / Events / Observability / Policy / OpenAPI / AI      │  ← 能力层（packages/）
├─────────────────────────────────────────────────────────────────────┤
│  Database / Queue / Storage                                         │  ← 数据与基础设施层（packages/）
├─────────────────────────────────────────────────────────────────────┤
│  Core (Router / Context / Middleware / Lifecycle)                   │  ← 核心框架层（packages/）
├─────────────────────────────────────────────────────────────────────┤
│  Bun Runtime                                                        │  ← 运行时层
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 目录结构：平台包与框架包分离

平台包放在 `packages/platform/` 子目录下，与框架层包在物理目录上明确区分：

```
packages/
├── core/                        # 框架层
├── database/                    # 框架层
├── cache/                       # 框架层
├── auth/                        # 框架层
├── events/                      # 框架层
├── observability/               # 框架层
├── openapi/                     # 框架层
├── ai/                          # 框架层
├── cli/                         # 框架层
├── testing/                     # 框架层
│
└── platform/                    # ✦ 平台层（新增目录）
    ├── system/                  # P0 - 系统管理核心
    ├── scheduler/               # P1 - 定时任务管理
    ├── oss/                     # P1 - 文件存储服务
    ├── monitor/                 # P2 - 系统监控
    ├── gen/                     # P2 - 代码生成器
    ├── notification/            # P2 - 消息中心
    ├── i18n/                    # P3 - 国际化
    ├── workflow/                # P3 - 工作流引擎
    └── boot/                    # 聚合包（一键引入）
```

**包名不变**：即使放在 `packages/platform/` 子目录下，npm 包名仍然是 `@ventostack/system`、`@ventostack/scheduler` 等，不增加 `platform-` 前缀。通过目录分组 + monorepo workspace 配置实现物理隔离。

**Bun workspace 配置**（`package.json`）：

```json
{
  "workspaces": [
    "packages/*",
    "packages/platform/*"
  ]
}
```

### 3.4 依赖约束

```
框架层（不变）：
core ← database ← cache ← auth

平台层（新增，只向下依赖框架层；auth 为能力层平台包，可被其他平台包消费）：
system       → core, database, cache, auth, events, observability
scheduler    → core, database, auth, events
monitor      → core, database, auth, observability
gen          → core, database, auth（已注册进 boot，经 createPlatform 装配）
oss          → core, database, auth
notification → core, database, auth, observability
i18n         → core, database, auth
workflow     → core, database, auth, events
ai-trace     → core, database, observability, ai, auth
```

平台层包之间**仅允许依赖 auth 能力包**（JWT/RBAC/ABAC/Session 引擎），不互相依赖业务包（横向解耦）。
跨包协作通过 EventBus 或注入回调实现。

---

## 四、框架层增强 vs 平台层封装

> 核心原则：框架层增强只做"能力暴露"和"安全修复"，业务逻辑全部归平台层。

### 4.1 框架层增强（修改已有包）

以下增强是**框架级能力补全**，与任何具体业务无关：

| 包 | 增强项 | 类型 | 原因 |
|----|-------|------|------|
| `auth` | Token 吊销持久化接口：`createTokenRevocationStore(adapter)` | **安全修复** | 当前是内存 Set，多实例/重启后失效。暴露 Store 接口让调用方注入 Redis/DB 实现 |
| `auth` | Session Store 增加 `destroyAllByUser(userId)` | **能力暴露** | admin 踢人需要按用户批量销毁 Session |
| `auth` | 统一踢人链路：`createAuthSessionManager({ tokenRefresh, sessionManager, deviceManager })` | **安全修复** | 将 Token 吊销、Session 销毁、设备移除三步原子联动 |
| `auth` | TOTP 模块增加 `verifyAndConsume(code)` 接口 | **安全修复** | 标记已使用的 code 防止时间窗口内重放 |
| `auth` | JWT verify 增加 `typ` 头部校验 | **安全加固** | 防止非 JWT 类型的 Token 被接受 |
| `events` | Cron 解析器增强（支持完整 5 位/6 位 Cron 表达式） | **能力补全** | 当前 `parseCronToInterval()` 只支持简化格式 |
| `events` | Scheduler 增加执行 Hook（`onBeforeExecute` / `onAfterExecute` / `onError`） | **能力暴露** | 让平台层可以注入日志记录/告警回调，不侵入调度器核心逻辑 |
| `database` | 暴露 `readTableSchema(tableName)` 公共 API | **能力暴露** | 将 `schema-diff.ts` 中已有的表结构读取逻辑独立导出 |
| `core` | tenant 中间件增加 `validateTenant` Hook | **安全修复** | 解析 tenantId 后校验用户是否有权访问该租户 |
| `core` | rate-limit 增加 `slidingWindow` 算法选项 | **能力补全** | 固定窗口存在边界突发问题 |

### 4.2 平台层封装（属于 system 的逻辑）

以下**不属于框架层增强**，而是 `system` 包自己的业务逻辑：

| 能力 | 归属 | 说明 |
|------|------|------|
| 登录/注册/找回密码的业务流程 | `system` | 调用 auth 的 JWT/Session/Password 引擎组装完整业务流程 |
| 权限加载器（从 DB 加载角色-权限 → 填充 RBAC 引擎） | `system` | `system` 启动时读取数据库，调用 `rbac.addRole()` / `rbac.grantPermission()` |
| 菜单权限树构建器（DB 菜单表 → 前端动态路由树） | `system` | 纯业务逻辑，将 `sys_menu` 表数据转换为前端路由结构 |
| 数据字典/系统参数的缓存策略 | `system` | `system` 调用 `cache.remember()` 实现缓存，与 cache 包无关 |
| 操作日志记录 | `system` | `system` 在路由层注入中间件，调用 `observability.createAuditLog()` |
| 表结构读取与代码生成 | `gen` | `gen` 包调用 database 的 `readTableSchema()` 公共 API |
| CLI gen 命令 | `gen` | `gen` 包通过 CLI 的命令注册扩展点新增子命令，不修改 CLI 源码 |

### 4.3 扩展优于耦合的设计示例

**gen 包扩展 CLI（而非修改 CLI）**：

```typescript
// packages/platform/gen/src/cli-plugin.ts
// gen 包导出一个 CLI 扩展函数，由调用方注册到 CLI 实例

import type { CLI } from '@ventostack/cli';
import { createGenService } from './service';

export function registerGenCommand(cli: CLI, genService: GenService) {
  cli.command('gen', '从数据库表生成 CRUD 代码')
    .option('--table <name>', '目标表名')
    .option('--module <name>', '模块名')
    .action(async (opts) => {
      await genService.generate({ tableName: opts.table, moduleName: opts.module });
    });
}
```

```typescript
// 调用方（apps/example 或 platform/boot）
import { createCLI } from '@ventostack/cli';
import { registerGenCommand } from '@ventostack/gen';

const cli = createCLI('my-app', '1.0.0');
const genService = createGenService({ db });
registerGenCommand(cli, genService);  // 扩展，不修改 CLI 源码
```

---

## 五、包设计详案

### 5.1 `@ventostack/system` — 系统管理核心（P0）

**定位**：企业后台的"骨架包"，覆盖若依 `ruoyi-system` 的核心功能。

**职责范围**：
- **认证业务流程**：登录（含暴力破解防护）、注册、找回密码、Refresh Token 签发与轮换、管理员强制踢人下线
- **用户管理**：CRUD、密码重置、状态控制、导入导出
- **角色管理**：CRUD、角色-权限绑定、角色-菜单绑定、数据权限范围
- **菜单/路由管理**：树形结构、按钮权限标识、动态路由生成
- **部门管理**：组织架构树
- **岗位管理**：职务字典、人员-岗位关联
- **数据字典**：字典类型 + 字典项、缓存、前端下拉接口
- **系统参数**：键值对、分组、运行时读取 + 缓存
- **通知公告**：CRUD、发布/撤回、已读未读
- **MFA 业务流程**：TOTP 绑定/解绑、恢复码生成与校验、MFA 验证端点（含独立限流）
- **操作日志**：基于 observability 审计日志的自动记录中间件

**与已有包的关系**：
- 调用 `@ventostack/auth` 的 `createJWT()` / `createRBAC()` / `createPolicyEngine()` / `createRowFilter()` / `createTOTP()` / `createPasswordHasher()` 等引擎
- 调用 `@ventostack/database` 的 `defineModel()` / `createQueryBuilder()` 做数据访问
- 调用 `@ventostack/cache` 的 `createCache()` 做字典/参数缓存
- 调用 `@ventostack/observability` 的 `createAuditLog()` 记录操作日志
- 调用 `@ventostack/core` 的 rate-limit 中间件做登录/MFA 限流
- 调用 `@ventostack/events` 的 EventBus 发送用户操作事件（供 notification 等订阅）

**核心模型设计**（所有表统一 `sys_` 前缀，与用户层业务表区分）：

```
sys_user            → 用户表（username, password_hash, email, phone, avatar, status, dept_id, mfa_enabled, mfa_secret）
sys_user_role       → 用户-角色关联表（user_id, role_id）
sys_role            → 角色表（name, code, sort, data_scope, status）
sys_role_menu       → 角色-菜单关联表（role_id, menu_id）
sys_menu            → 菜单表（parent_id, name, path, component, type, permission, icon, sort）
                        type: directory / menu / button
sys_dept            → 部门表（parent_id, name, leader, sort, status）
sys_post            → 岗位表（name, code, sort, status）
sys_user_post       → 用户-岗位关联表（user_id, post_id）
sys_dict_type       → 字典类型表（name, code, status）
sys_dict_data       → 字典数据表（type_code, label, value, sort, css_class, status）
sys_config          → 系统参数表（name, key, value, type, group, remark）
sys_notice          → 通知公告表（title, content, type, status, publisher_id, publish_at）
sys_user_notice     → 用户-公告已读表（user_id, notice_id, read_at）
sys_login_log       → 登录日志表（user_id, username, ip, location, browser, os, status, message, login_at）
sys_operation_log   → 操作日志表（user_id, module, action, method, url, ip, params, result, duration, created_at）
sys_mfa_recovery    → MFA 恢复码表（user_id, code_hash, used_at）
```

**高级认证能力**：

```typescript
// 登录流程（含暴力破解防护）
const authService = createAuthService({
  db, cache, jwt: createJWT({ secret }), passwordHasher: createPasswordHasher(),
  tokenRefresh: createTokenRefresh({ jwt, revocationStore: createRedisRevocationStore(cache) }),
  sessionManager: createSessionManager(redisStore),
  deviceManager: createMultiDeviceManager({ maxDevices: 5 }),
  rateLimiter: createLoginRateLimiter({ cache, maxAttempts: 5, lockDuration: 30 * 60 }), // 5 次失败锁定 30 分钟
  auditLog,
});

// 登录
const result = await authService.login({ username, password, ip, userAgent });
// → { accessToken, refreshToken, sessionId, deviceSession }

// Refresh Token 轮换
const tokens = await authService.refreshToken(oldRefreshToken);
// → { accessToken, refreshToken }（旧 Token 自动吊销）

// 管理员强制踢人
await authService.forceLogout(userId);
// → 销毁所有 Session + 吊销所有 Refresh Token + 移除所有设备记录

// MFA 绑定
const mfaSetup = await authService.enableMFA(userId);
// → { secret, qrCodeUri, recoveryCodes }

// MFA 验证（独立限流：每分钟最多 5 次）
const verified = await authService.verifyMFA(userId, code);
```

**权限加载器**：

```typescript
// 系统启动时，从数据库加载权限数据填充 auth 引擎
const permissionLoader = createPermissionLoader({ db, rbac, policyEngine });

async function initPermissions() {
  // 加载所有角色及其权限
  const roles = await db.query(RoleModel).select();
  for (const role of roles) {
    rbac.addRole(role.code);
    const perms = await db.query(RoleMenuModel).where(rm => rm.roleId.eq(role.id)).select();
    for (const perm of perms) {
      rbac.grantPermission(role.code, perm.resource, perm.action);
    }
  }
}
```

**菜单权限树构建器**：

```typescript
// 根据用户角色生成前端动态路由
const menuBuilder = createMenuTreeBuilder({ db });

const userRoutes = await menuBuilder.buildRoutesForUser(userId);
// → [{ path: '/system', name: 'System', children: [{ path: '/system/user', ... }] }]

const userPermissions = await menuBuilder.buildPermissionsForUser(userId);
// → ['system:user:list', 'system:user:create', 'system:role:list', ...]
```

**核心工厂函数**：

```typescript
// 一键创建系统管理模块
const system = createSystemModule({
  db, cache,
  auth: { jwt, rbac, policyEngine, rowFilter, passwordHasher, totp, tokenRefresh, sessionManager, deviceManager },
  auditLog, eventBus,
});

// 也可单独使用各子 Service
const userSvc = createUserService({ db, cache });
const roleSvc = createRoleService({ db, cache, rbac });
const menuSvc = createMenuService({ db, cache });
const deptSvc = createDeptService({ db });
const dictSvc = createDictService({ db, cache });
const configSvc = createConfigService({ db, cache });
const noticeSvc = createNoticeService({ db });
const authSvc = createAuthService({ ... }); // 登录/注册/踢人/MFA
const permLoader = createPermissionLoader({ db, rbac });
const menuBuilder = createMenuTreeBuilder({ db });
```

**REST API 规划**：

```
# 认证（公开端点，有独立限流）
POST   /api/auth/login              # 登录（IP + 用户名双维度限流）
POST   /api/auth/logout             # 登出
POST   /api/auth/refresh            # Refresh Token 轮换
POST   /api/auth/register           # 注册
POST   /api/auth/forgot-password    # 找回密码

# MFA（独立限流：每分钟 5 次）
POST   /api/auth/mfa/enable         # 开启 MFA → 返回 QR Code + 恢复码
POST   /api/auth/mfa/verify         # MFA 验证
POST   /api/auth/mfa/disable        # 关闭 MFA
POST   /api/auth/mfa/recover        # 使用恢复码登录

# 用户管理（需认证 + 权限）
GET    /api/system/users              # 用户列表（分页、筛选）
GET    /api/system/users/:id          # 用户详情
POST   /api/system/users              # 创建用户
PUT    /api/system/users/:id          # 更新用户
DELETE /api/system/users/:id          # 删除用户
PUT    /api/system/users/:id/reset-pwd  # 重置密码
PUT    /api/system/users/:id/status   # 状态变更
POST   /api/system/users/export       # 导出

# 角色管理
GET    /api/system/roles
GET    /api/system/roles/:id
POST   /api/system/roles
PUT    /api/system/roles/:id
DELETE /api/system/roles/:id
PUT    /api/system/roles/:id/menus    # 分配菜单权限
PUT    /api/system/roles/:id/data-scope  # 分配数据权限范围

# 菜单管理
GET    /api/system/menus              # 菜单树
GET    /api/system/menus/:id
POST   /api/system/menus
PUT    /api/system/menus/:id
DELETE /api/system/menus/:id

# 当前用户的菜单/权限（前端动态路由用）
GET    /api/system/user/routes        # 当前用户可访问的路由树
GET    /api/system/user/permissions   # 当前用户的权限标识列表

# 部门管理
GET    /api/system/depts              # 部门树
POST   /api/system/depts
PUT    /api/system/depts/:id
DELETE /api/system/depts/:id

# 岗位管理
GET    /api/system/posts
POST   /api/system/posts
PUT    /api/system/posts/:id
DELETE /api/system/posts/:id

# 字典管理
GET    /api/system/dict/types         # 字典类型列表
GET    /api/system/dict/types/:code/data  # 字典项（前端下拉用，走缓存）
POST   /api/system/dict/types
PUT    /api/system/dict/types/:code
DELETE /api/system/dict/types/:code

# 系统参数
GET    /api/system/configs
GET    /api/system/configs/:key       # 按键查值（走缓存）
POST   /api/system/configs
PUT    /api/system/configs/:key
DELETE /api/system/configs/:key

# 通知公告
GET    /api/system/notices
POST   /api/system/notices
PUT    /api/system/notices/:id
PUT    /api/system/notices/:id/publish
PUT    /api/system/notices/:id/read   # 标记已读

# 操作日志（只读）
GET    /api/system/operation-logs     # 操作日志查询
GET    /api/system/login-logs         # 登录日志查询
```

---

### 5.2 `@ventostack/scheduler` — 定时任务管理（P1）

**定位**：在 `@ventostack/events` 的 `createScheduler()` 引擎之上，增加业务管理能力。

**职责范围**：
- 任务配置的 CRUD（持久化到数据库）
- 任务启停、立即执行
- 执行日志记录与查询
- 执行失败告警（通过 EventBus 发送事件，由 notification 包订阅）
- Cron 表达式校验与可视化

**与已有包的关系**：
- 调用 `@ventostack/events` 的 `createScheduler()` + `onBeforeExecute` / `onAfterExecute` / `onError` Hook 做底层调度和日志记录
- 调用 `@ventostack/database` 持久化任务配置和执行日志
- 不依赖 notification 包——通过 EventBus 发送 `scheduler.job.failed` 事件解耦

**核心模型**：

```
sys_schedule_job       → 任务配置（name, cron, handler_id, params, status, description）
sys_schedule_job_log   → 执行日志（job_id, start_at, end_at, status, result, error, duration_ms）
```

**核心工厂函数**：

```typescript
const scheduler = createSchedulerModule({
  db, baseScheduler: createScheduler(), eventBus, auditLog
});
```

---

### 5.3 `@ventostack/monitor` — 系统监控（P2）

**定位**：面向管理后台的监控聚合 API，复用 `@ventostack/observability` 的采集能力。

**职责范围**：
- 在线用户会话列表与强踢（调用 auth 的 Session Store 和统一踢人链路）
- 服务器状态（CPU、内存、磁盘 — `Bun.gc()` / `os` 模块 / `process.memoryUsage()`）
- 缓存监控（Key 数量、命中率、内存占用）
- 数据源监控（连接池状态、慢查询）
- 接口调用统计（复用 Prometheus 指标）
- 健康检查聚合端点（`/api/monitor/health` → 调用 observability 的 HealthCheck）

**不引入新数据库表**——纯聚合 API，数据来自运行时状态和已有的指标系统。

---

### 5.4 `@ventostack/gen` — 代码生成器（P2）

**定位**：从数据库表结构自动生成 CRUD 前后端代码。

**职责范围**：
- 读取数据库表结构（调用 database 的 `readTableSchema()` 公共 API）
- 字段配置（显示类型、查询方式、校验规则）
- 模板管理（单表、树表、主子表）
- 生成后端 Model / Service / Router
- 生成前端 API 客户端（基于 OpenAPI 类型）
- **通过 CLI 扩展注册 `gen` 命令**（不修改 CLI 源码）

**核心模型**：

```
sys_gen_table          → 代码生成表配置（table_name, module_name, gen_type, package_path）
sys_gen_table_column   → 字段配置（column_name, ts_type, display_type, query_type, required)
```

---

### 5.5 `@ventostack/oss` — 文件存储服务（P1）

**定位**：统一的文件上传、存储和管理抽象层。

**职责范围**：
- 文件上传（复用 core 的 upload 中间件做前置校验 + 增加 magic-byte 服务端校验）
- 存储适配器（本地磁盘、S3/OSS、MinIO）
- 文件记录管理（谁上传的、什么时候、引用计数）
- 私有文件的签名 URL 访问

**核心模型**：

```
sys_oss_file           → 文件记录（original_name, storage_path, size, mime, uploader_id, ref_count, bucket)
```

---

### 5.6 `@ventostack/notification` — 消息中心（P2）

**定位**：统一的消息通知基础设施。

**职责范围**：
- 站内信（发送、已读未读、批量标记）
- 邮件模板管理 + 发送（SMTP 适配器）
- 短信模板管理 + 发送（SMS Provider 适配器）
- 渠道适配器抽象（SMTP / SMS / Webhook）

**核心模型**：

```
sys_notify_template    → 消息模板（type, channel, title_template, content_template, variables）
sys_notify_message     → 消息实例（receiver_id, channel, title, content, status)
sys_notify_user_read   → 用户消息关联（user_id, message_id, read_at)
```

---

## 六、新增包总览与优先级

| 优先级 | 包名 | 目录 | 依赖 | 说明 |
|-------|------|------|------|------|
| **P0** | `system` | `packages/platform/system` | auth, database, cache, observability, core (rate-limit), events | 系统管理核心 + 认证业务流程 |
| **P1** | `oss` | `packages/platform/oss` | core, database | 文件存储 |
| **P1** | `scheduler` | `packages/platform/scheduler` | events, database, observability | 定时任务管理 |
| **P2** | `gen` | `packages/platform/gen` | database, openapi | 代码生成器（通过扩展注册 CLI 命令） |
| **P2** | `monitor` | `packages/platform/monitor` | observability, cache, database, auth | 系统监控面板后端 |
| **P2** | `notification` | `packages/platform/notification` | events, database | 消息中心 |
| **P3** | `i18n` | `packages/platform/i18n` | core, database | 国际化资源管理 |
| **P3** | `workflow` | `packages/platform/workflow` | events, auth, database | 工作流引擎 |
| **P3** | `boot` | `packages/platform/boot` | 聚合所有平台包 | 一键引入 + 统一初始化 |

**P0 必须先行**：`system` 是所有企业后台的地基。没有 system，其他平台包的权限、审计、通知都缺少业务载体。

---

## 七、框架级高级能力清单

> 以下能力已存在于框架层，平台层直接复用，不需要重新实现。

### 7.1 配置管理

框架层已有完整的配置系统（`@ventostack/core`）：

| 能力 | 实现位置 | 说明 |
|------|---------|------|
| 多源配置合并 | `core/config.ts` → `loadConfig()` | Schema 默认值 → app.yaml → app.{env}.yaml → .env → 环境变量 → CLI 参数 |
| 环境隔离 | `core/config.ts` | 按 `NODE_ENV` 加载不同配置文件 |
| 热重载 | `core/config-watch.ts` | 文件变化时重新加载配置 |
| 类型安全 Schema | `core/config.ts` | Discriminated union 字段类型，编译期推导 |
| Secret 管理 | `core/config.ts` → `securityPrecheck()` | 密钥过短/缺失、调试开关、HTTPS 未启用时拒绝启动 |
| 配置加密 | `core/config-encryption.ts` | 敏感配置项加密存储 |
| 12-Factor | `core/twelve-factor.ts` | 环境变量展开为嵌套结构 |

平台层（system）的**系统参数**（`sys_config`）是另一层：运行时可通过管理后台动态修改的键值对，走数据库 + 缓存。不替代框架级配置。

### 7.2 健康检查

框架层已有（`@ventostack/observability` → `createHealthCheck()`）：

- 可配置多个检查项（数据库连通性、Redis 连通性、磁盘空间等）
- 返回结构化健康状态
- 平台层 monitor 包直接聚合暴露为 `/api/monitor/health`

### 7.3 限流

框架层已有（`@ventostack/core` → rate-limit 中间件）：

| 维度 | 支持情况 |
|------|---------|
| 按 IP | `keyFn` 默认取客户端 IP |
| 按用户 | `keyFn: (ctx) => ctx.user?.id` |
| 按路由 | 每个路由组实例化独立中间件 |
| Redis 分布式 | `createRedisRateLimitStore()`，Lua 原子计数 |
| 建议增加 | 滑动窗口算法选项 |

### 7.4 灰度 / Feature Flag / A/B Testing

框架层已有：

| 能力 | 实现位置 | 说明 |
|------|---------|------|
| Feature Toggle | `core/feature-toggle.ts` | 内存开关 + 条件函数（按用户/租户/环境） |
| A/B Testing / Canary | `core/ab-testing.ts` | 加权变体分配 + 粘性分桶（hash 确定性） + 百分比灰度 |
| Feature Flag 中间件 | 可基于 `feature-toggle.ts` 编写路由守卫 | 请求级别的功能开关判定 |

**生产化建议**：当前均为内存存储。P2 阶段可考虑增加 Redis/DB 持久化适配器或对接 LaunchDarkly 等外部服务。

### 7.5 高阶数据库查询

框架层已有（`@ventostack/database`）：

| 能力 | 说明 |
|------|------|
| 类型安全 QueryBuilder | 链式调用 + 回调风格 WHERE |
| 复杂 WHERE | AND/OR 嵌套、IN/LIKE/BETWEEN/IS NULL |
| 聚合查询 | GROUP BY / HAVING / COUNT / SUM / AVG / MAX / MIN |
| 关联查询 | hasOne / hasMany / belongsTo / belongsToMany + LEFT JOIN / Eager Load |
| 子查询 | QueryBuilder 支持 nested 子查询 |
| 读写分离 | `createReadWriteSplit()` |
| 批量操作 | batchInsert / batchUpdate |
| 乐观锁 | version 字段自动校验 |
| 软删除 | deleted_at 字段自动过滤 |
| Schema Diff | `diffSchemas()` 比较表结构差异 |
| 事务 | 嵌套 SAVEPOINT + 隔离级别 |

### 7.6 MFA

框架层已有引擎（`@ventostack/auth` → `createTOTP()`）：

- RFC 6238 TOTP 实现
- 支持 SHA-1 / SHA-256 / SHA-512
- `otpauth://` URI 生成（Google Authenticator 兼容）

平台层（system）补充业务流程：
- TOTP 绑定/解绑 API
- 恢复码生成与校验
- MFA 验证端点（含独立限流）
- 防重放保护

### 7.7 安全增强（框架层已有能力）

| 能力 | 实现位置 | 说明 |
|------|---------|------|
| CORS | `core/middlewares/cors.ts` | 默认 deny，禁止 credentials + wildcard |
| CSRF | `core/middlewares/csrf.ts` | Double-submit Cookie，恒定时间比较 |
| XSS | `core/middlewares/xss.ts` | 安全头 + escapeHTML + detectXSS |
| SSRF | `core/middlewares/ssrf.ts` | 屏蔽内网/元数据 IP + DNS 解析校验 |
| HMAC | `core/middlewares/hmac.ts` | 请求签名验证 |
| 上传安全 | `core/middlewares/upload.ts` | 大小/类型/扩展名/双扩展名/空字节 |
| IP 过滤 | `core/middlewares/ip-filter.ts` | 白名单/黑名单 + CIDR |
| 请求超时 | `core/middlewares/timeout.ts` | 可配置超时 |
| HTTPS 强制 | `core/middlewares/https.ts` | HTTP → HTTPS 重定向 |
| 熔断器 | `core/circuit-breaker.ts` | closed/open/half-open 三态 |
| Worker 线程池 | `core/worker-pool.ts` | CPU 密集任务隔离 |

---

## 八、聚合包与快速启动

### 8.1 `@ventostack/boot`（聚合包）

放在 `packages/platform/boot`，不包含具体实现，只做依赖聚合和统一初始化：

```typescript
import { createPlatform } from '@ventostack/boot';

const platform = await createPlatform({
  // 基础设施
  db: { driver: 'postgresql', url: process.env.DATABASE_URL },
  cache: { driver: 'redis', url: process.env.REDIS_URL },

  // 按需启用平台模块
  modules: {
    system: true,       // 用户/角色/菜单/字典/参数/公告/认证
    scheduler: true,    // 定时任务管理
    oss: true,          // 文件存储
    monitor: true,      // 系统监控
    notification: false, // 按需
  },

  // 认证配置
  auth: {
    jwt: { secret: process.env.JWT_SECRET },
    session: { store: 'redis' },
    mfa: { enabled: true },
  },
});

// platform.app → VentoStackApp 实例
// platform.system → SystemModule
// platform.scheduler → SchedulerModule
```

### 8.2 不使用聚合包的灵活方式

每个平台包也可以独立使用：

```typescript
import { createApp } from '@ventostack/core';
import { createDatabase } from '@ventostack/database';
import { createCache, createRedisAdapter } from '@ventostack/cache';
import { createRBAC, createJWT } from '@ventostack/auth';
import { createSystemModule } from '@ventostack/system';

const app = createApp();
const db = createDatabase({ driver: 'postgresql', url: '...' });
const cache = createCache(createRedisAdapter({ client: redis }));
const rbac = createRBAC();
const jwt = createJWT({ secret: '...' });

const system = createSystemModule({ db, cache, auth: { rbac, jwt } });

app.use(system.routes());
app.listen(3000);
```

---

## 九、实施路线图

### Phase 0：安全修复（与 Phase 1 并行）

```
1. auth: Token 吊销持久化（createTokenRevocationStore 接口 + Redis 实现）
2. auth: Session Store 增加 destroyAllByUser(userId)
3. auth: 统一踢人链路（tokenRefresh + sessionManager + deviceManager 联动）
4. auth: TOTP verifyAndConsume() 防重放
5. auth: JWT verify 增加 typ 校验
6. core: tenant 中间件增加 validateTenant Hook
7. events: Scheduler 增加 onBeforeExecute / onAfterExecute / onError Hook
8. database: 暴露 readTableSchema() 公共 API
```

### Phase 1：P0 — system 包

```
1. 定义 sys_* 数据库模型（15 张表）
2. 实现 AuthService（登录/注册/找回密码/踢人/MFA）
3. 实现 UserService（CRUD + 密码重置 + 状态控制 + 导入导出）
4. 实现 RoleService（CRUD + 权限分配 + 菜单绑定 + 数据权限范围）
5. 实现 MenuService（树形 CRUD + 动态路由构建 + 权限标识）
6. 实现 DeptService（组织架构树）
7. 实现 PostService（岗位管理）
8. 实现 DictService（字典 + 缓存 + 前端下拉接口）
9. 实现 ConfigService（系统参数 + 缓存）
10. 实现 NoticeService（公告 CRUD + 已读未读）
11. 实现 PermissionLoader（DB → RBAC 引擎）
12. 实现 MenuTreeBuilder（DB → 前端路由树）
13. 实现操作日志中间件（基于 auditLog 自动记录）
14. 编写迁移文件 + Seed 数据
15. 编写 REST API + 集成测试
16. 安全测试：暴力破解/越权/注入/踢人/TOTP 重放
17. 编写文档与示例
```

### Phase 2：P1 — oss + scheduler

```
1. 实现 OSS 存储适配器接口（LocalStorage / S3Storage）
2. 实现文件上传/下载/管理的 REST API（含 magic-byte 校验）
3. 增强 events 包的 Cron 解析器（完整 5/6 位 Cron）
4. 实现 scheduler 包：任务 CRUD + 执行日志 + 告警事件
5. 编写测试与文档
```

### Phase 3：P2 — gen + monitor + notification

```
1. 实现 gen 包：读表结构 → 模板渲染 → 生成代码
2. gen 注册 CLI 扩展命令（bun run gen --table xxx）
3. 实现 monitor 包：聚合 API（健康检查/在线用户/服务器状态/缓存/数据源）
4. 实现 notification 包：站内信 + 邮件/短信模板 + 渠道适配器
5. 聚合包 @ventostack/boot
```

### Phase 4：P3 — i18n + workflow + Feature Flag 持久化

```
1. 实现 i18n 包：多语言资源管理
2. 实现 workflow 包：流程设计 + 审批链
3. Feature Toggle / A/B Testing 增加 Redis 持久化适配器
```

---

## 十、完整目录结构

```
packages/
├── core/                        # 框架层（已有）
│   └── src/middlewares/         # 14 个安全中间件 + Feature Toggle + A/B Testing
├── database/                    # 框架层（已有，增强：暴露 readTableSchema）
├── cache/                       # 框架层（已有）
├── auth/                        # 框架层（已有，增强：Token 吊销持久化 + 统一踢人 + TOTP 防重放）
├── events/                      # 框架层（已有，增强：完整 Cron + 执行 Hook）
├── observability/               # 框架层（已有）
├── openapi/                     # 框架层（已有）
├── ai/                          # 框架层（已有）
├── cli/                         # 框架层（已有，不变——gen 通过扩展注册命令）
├── testing/                     # 框架层（已有）
│
└── platform/                    # ✦ 平台层（新增）
    ├── system/                  # P0 - 系统管理核心
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── models/          # 15 张 sys_* 表的 defineModel
    │   │   │   ├── user.ts
    │   │   │   ├── role.ts
    │   │   │   ├── menu.ts
    │   │   │   ├── dept.ts
    │   │   │   ├── post.ts
    │   │   │   ├── dict.ts
    │   │   │   ├── config.ts
    │   │   │   ├── notice.ts
    │   │   │   ├── login-log.ts
    │   │   │   ├── operation-log.ts
    │   │   │   └── mfa-recovery.ts
    │   │   ├── services/        # 业务逻辑
    │   │   │   ├── auth.ts      # 登录/注册/踢人/MFA/限流
    │   │   │   ├── user.ts
    │   │   │   ├── role.ts
    │   │   │   ├── menu.ts
    │   │   │   ├── dept.ts
    │   │   │   ├── post.ts
    │   │   │   ├── dict.ts
    │   │   │   ├── config.ts
    │   │   │   ├── notice.ts
    │   │   │   ├── permission-loader.ts  # DB → RBAC 引擎
    │   │   │   └── menu-tree-builder.ts  # DB → 前端路由树
    │   │   ├── routes/          # REST API 路由
    │   │   │   ├── auth.ts      # /api/auth/* （公开端点）
    │   │   │   ├── user.ts      # /api/system/users/*
    │   │   │   ├── role.ts      # /api/system/roles/*
    │   │   │   ├── menu.ts      # /api/system/menus/*
    │   │   │   ├── dept.ts      # /api/system/depts/*
    │   │   │   ├── post.ts      # /api/system/posts/*
    │   │   │   ├── dict.ts      # /api/system/dict/*
    │   │   │   ├── config.ts    # /api/system/configs/*
    │   │   │   ├── notice.ts    # /api/system/notices/*
    │   │   │   ├── log.ts       # /api/system/operation-logs / login-logs
    │   │   │   └── user-routes.ts  # /api/system/user/routes / permissions
    │   │   ├── middlewares/     # 平台级中间件
    │   │   │   ├── operation-log.ts  # 自动操作日志记录
    │   │   │   └── login-rate-limit.ts  # 登录/MFA 限流
    │   │   └── module.ts        # createSystemModule 聚合
    │   ├── migrations/          # sys_* 建表迁移
    │   ├── seeds/               # 初始数据（管理员/基础角色/菜单）
    │   ├── tests/
    │   └── package.json
    │
    ├── scheduler/               # P1 - 定时任务管理
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── models/          # sys_schedule_job, sys_schedule_job_log
    │   │   ├── services/
    │   │   ├── routes/
    │   │   └── module.ts
    │   └── package.json
    │
    ├── oss/                     # P1 - 文件存储服务
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── adapters/        # localStorage, s3Storage
    │   │   ├── models/          # sys_oss_file
    │   │   ├── services/
    │   │   ├── routes/
    │   │   └── module.ts
    │   └── package.json
    │
    ├── monitor/                 # P2 - 系统监控
    ├── gen/                     # P2 - 代码生成器
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── cli-plugin.ts   # registerGenCommand(cli, genService)
    │   │   ├── models/         # sys_gen_table, sys_gen_table_column
    │   │   ├── services/
    │   │   ├── templates/      # 代码模板
    │   │   └── module.ts
    │   └── package.json
    ├── notification/            # P2 - 消息中心
    ├── i18n/                    # P3 - 国际化
    ├── workflow/                # P3 - 工作流引擎
    │
    └── boot/                    # P3 - 聚合包
        ├── src/
        │   ├── index.ts
        │   └── create-platform.ts
        └── package.json
```

---

## 十一、关键设计决策记录

### 11.1 为什么平台包放在 `packages/platform/` 而不是 `packages/` 下

- **视觉分离**：`ls packages/` 一眼区分框架层（10 个目录）和平台层（platform 子目录）
- **职责清晰**：框架包维护者只关注 `packages/`，平台包维护者聚焦 `packages/platform/`
- **包名不变**：npm 包名仍然是 `@ventostack/system`，不增加层级前缀
- **workspace 兼容**：Bun workspace 支持 `packages/platform/*` 通配符

### 11.2 为什么不叫 `@ventostack/enterprise-*`

- `enterprise-*` 前缀让每个包名过长（`@ventostack/enterprise-user`）
- 当前框架命名是功能导向的（`auth`, `cache`, `events`），保持一致性
- `system`, `scheduler`, `oss` 在生态中语义清晰
- 目录分离已经表达了"平台级"的含义

### 11.3 为什么 system 不拆成 user / role / menu 等子包

- 用户、角色、菜单、部门在业务上高度耦合（角色关联菜单、用户关联部门和角色）
- 拆子包导致大量跨包依赖和循环引用
- 若依 `ruoyi-system` 也是一个模块管理所有领域
- Node/Bun 单进程场景没有独立部署的诉求

### 11.4 为什么"增强"和"业务封装"要严格区分

- **增强**：暴露已有能力（如 `readTableSchema`）、修复安全缺陷（如 Token 吊销持久化）——改的是框架层源码
- **业务封装**：登录流程、权限加载器、菜单树构建——放在 platform/system，不碰框架层
- 混在一起会让框架包膨胀且不可独立使用

### 11.5 gen 为什么通过扩展而不是直接修改 CLI

- CLI 是框架级工具，不应知道"代码生成"这个业务概念
- gen 包导出 `registerGenCommand(cli, genService)` 函数
- 调用方决定是否注册这个命令——不引入 gen 包就不出现 gen 命令
- 符合"扩展优于耦合"原则

### 11.6 为什么所有平台表统一 `sys_` 前缀

- 与用户层业务表（如 `order`、`product`）明确区分
- 数据库管理、迁移、备份时可按前缀批量操作
- 若依、JeecgBoot 等成熟框架的通用实践
- 前缀不进入代码变量名（Model 名仍然是 `UserModel`、`RoleModel`）

---

## 十二、风险与注意事项

| 风险 | 应对策略 |
|------|---------|
| system 包模型过重（15+ 张表） | 模型与 Service 按领域分文件，module.ts 只做聚合；迁移文件严格版本化 |
| 聚合包初始化配置项爆炸 | 合理默认值 + 按需启用（`modules: { system: true, scheduler: false }`） |
| 平台层 API 与前端框架耦合 | API 层只输出 JSON + OpenAPI 契约，不绑定任何前端 UI 框架 |
| 字典/参数缓存一致性 | 写操作时同步更新缓存，提供 `cache.invalidate()` 手动刷新入口 |
| 多租户兼容性 | P0 阶段 sys_* 表不增加 tenant_id，架构上预留 RowFilter 接入点，P3 阶段统一处理 |
| Token 吊销性能 | Redis Set 存储 JTI，设置与 Refresh Token 相同的 TTL 自动过期清理 |
| 安全修复影响现有 API | 安全增强以"增加接口"为主（如 `createTokenRevocationStore`），不修改已有函数签名 |
