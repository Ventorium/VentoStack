---
title: 平台启动
description: 使用 createPlatform() 一键聚合所有平台模块
---

# 平台启动（@ventostack/boot）

`createPlatform()` 是 VentoStack 平台层的聚合入口，一次性创建并组装所有业务模块（系统管理、代码生成、监控、通知、国际化、工作流、文件存储、任务调度），避免手动逐个实例化和注册。

## 快速开始

```typescript
import { createPlatform } from "@ventostack/boot";

const platform = await createPlatform({
  executor,
  readTableSchema,
  listTables,
  cache,
  jwt,
  jwtSecret,
  passwordHasher,
  totpManager,
  rbac,
  rowFilter,
  authSessionManager,
  tokenRefreshManager,
  sessionManager,
  multiDeviceManager,
  auditStore,
  eventBus,
  healthCheck,
  scheduler,
});

// 注册所有模块路由
app.use(platform.router);

// 初始化所有模块（加载权限、启动定时任务等）
await platform.init();
```

## 配置选项（PlatformConfig）

### 必填依赖

| 参数 | 类型 | 说明 |
|------|------|------|
| `executor` | `SqlExecutor` | 数据库执行器 |
| `cache` | `Cache` | 缓存实例 |
| `jwt` | `JWTManager` | JWT 管理器 |
| `jwtSecret` | `string` | JWT 签名密钥 |
| `passwordHasher` | `PasswordHasher` | 密码哈希器 |
| `totpManager` | `TOTPManager` | TOTP 双因素认证 |
| `rbac` | `RBAC` | RBAC 权限引擎 |
| `rowFilter` | `RowFilter` | 行级过滤器 |
| `authSessionManager` | `AuthSessionManager` | 统一认证会话 |
| `tokenRefreshManager` | `TokenRefreshManager` | Token 刷新管理 |
| `sessionManager` | `SessionManager` | Session 管理 |
| `multiDeviceManager` | `MultiDeviceManager` | 多设备管理 |
| `auditStore` | `AuditStore` | 审计日志存储 |
| `eventBus` | `EventBus` | 事件总线 |
| `healthCheck` | `HealthCheck` | 健康检查 |
| `scheduler` | `Scheduler` | 调度器 |

### 可选依赖

| 参数 | 类型 | 说明 |
|------|------|------|
| `db` | `Database` | 数据库实例，未提供时从 `executor` 自动创建 |
| `storageAdapter` | `StorageAdapter` | OSS 存储适配器（启用文件存储模块时必填） |
| `notifyChannels` | `Map<string, NotifyChannel>` | 通知通道（启用通知模块时必填） |
| `jobHandlers` | `JobHandlerMap` | 定时任务处理器（启用调度模块时建议配置） |

### 模块开关

通过 `modules` 对象可以按需禁用特定模块（默认全部启用）：

```typescript
const platform = await createPlatform({
  // ...依赖配置
  modules: {
    system: true,        // 系统管理（用户、角色、菜单等）
    gen: true,           // 代码生成
    monitor: true,       // 系统监控
    notification: false, // 禁用通知
    i18n: true,          // 国际化
    workflow: true,      // 工作流
    oss: true,           // 文件存储
    scheduler: true,     // 任务调度
  },
});
```

:::caution[模块依赖]
- `notification` 模块需要配置 `notifyChannels`，否则不会创建
- `oss` 模块需要配置 `storageAdapter`，否则不会创建
- `scheduler` 模块建议配置 `jobHandlers`，否则定时任务无法执行
:::

## 返回值（Platform）

| 字段 | 类型 | 说明 |
|------|------|------|
| `system` | `SystemModule?` | 系统管理模块实例 |
| `gen` | `GenModule?` | 代码生成模块实例 |
| `monitor` | `MonitorModule?` | 监控模块实例 |
| `notification` | `NotificationModule?` | 通知模块实例 |
| `i18n` | `I18nModule?` | 国际化模块实例 |
| `workflow` | `WorkflowModule?` | 工作流模块实例 |
| `oss` | `OSSModule?` | 文件存储模块实例 |
| `scheduler` | `SchedulerModule?` | 调度模块实例 |
| `router` | `Router` | 聚合所有已启用模块路由的统一路由器 |
| `init()` | `() => Promise<void>` | 初始化所有已启用模块 |

## 典型应用装配

```typescript
import { createApp, createRouter, cors, requestId, requestLogger, errorHandler } from "@ventostack/core";
import { createPlatform } from "@ventostack/boot";

// 1. 基础设施
const database = createDatabaseConnection();
const cache = await createCacheInstance();
const auth = assembleAuthEngines(cache.redisClient);

// 2. 平台聚合
const platform = await createPlatform({
  executor: database.executor,
  db: database.db,
  readTableSchema,
  listTables,
  cache: cache.cache,
  jwt: auth.jwt,
  jwtSecret: auth.jwtSecret,
  passwordHasher: auth.passwordHasher,
  totpManager: auth.totp,
  rbac: auth.rbac,
  rowFilter: auth.rowFilter,
  authSessionManager: auth.authSessionManager,
  tokenRefreshManager: auth.tokenRefresh,
  sessionManager: auth.sessionManager,
  multiDeviceManager: auth.deviceManager,
  auditStore: createAuditLog(),
  eventBus: createEventBus(),
  healthCheck: createDefaultHealthCheck({ sql: database.executor }),
  scheduler: createScheduler(),
  storageAdapter: createStorageAdapter(),
});

await platform.init();

// 3. 应用装配
const app = createApp({ port: 9320 });
app.use(requestId());
app.use(cors({ origin: ["http://localhost:3000"] }));
app.use(requestLogger());

// 健康检查（无需认证）
app.use(healthRouter);

// 平台路由（自动包含所有模块）
app.use(platform.router);

app.use(errorHandler());
await app.listen();
```

## 架构说明

`createPlatform` 遵循以下原则：

- **默认启用**：所有模块默认启用，通过 `modules` 按需关闭
- **依赖注入**：所有基础设施通过参数传入，不自行创建
- **路由聚合**：返回统一 `router`，内部按模块挂载子路由
- **延迟初始化**：`init()` 单独调用，确保数据库和缓存已就绪
