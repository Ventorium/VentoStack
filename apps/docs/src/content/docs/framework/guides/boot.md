---
title: 平台启动引导
description: 使用 createPlatform() 一键创建完整的 VentoStack 平台
---

# 平台启动引导

`createPlatform()` 是 VentoStack 的顶层聚合函数，负责将所有业务模块组装为一个统一的平台实例。

## 核心函数

```ts
import { createPlatform } from "@ventostack/boot";

const platform = await createPlatform(config);
```

### 函数签名

```ts
async function createPlatform(config: PlatformConfig): Promise<Platform>
```

接收一个 `PlatformConfig` 配置对象，返回一个 `Platform` 实例。所有子模块的路由会被聚合到 `platform.router` 上，调用 `platform.init()` 会依次初始化每个已启用的模块。

## PlatformConfig 配置

`PlatformConfig` 接口定义了平台运行所需的全部依赖：

```ts
interface PlatformConfig {
  // 数据库
  executor: SqlExecutor;                  // 必填，SQL 执行器
  db?: Database;                          // 可选，若未提供则自动从 executor 创建
  readTableSchema: (executor: SqlExecutor, tableName: string) => Promise<TableSchemaInfo>;
  listTables: (executor: SqlExecutor) => Promise<string[]>;

  // 缓存与认证
  cache: Cache;
  jwt: JWTManager;
  jwtSecret: string;
  passwordHasher: PasswordHasher;
  totpManager: TOTPManager;
  rbac: RBAC;
  rowFilter: RowFilter;

  // 会话管理
  authSessionManager: AuthSessionManager;
  tokenRefreshManager: TokenRefreshManager;
  sessionManager: SessionManager;
  multiDeviceManager: MultiDeviceManager;

  // 基础设施
  auditStore: AuditStore;
  eventBus: EventBus;
  healthCheck: HealthCheck;
  scheduler: Scheduler;

  // 模块开关与扩展配置
  modules?: { system?: boolean; gen?: boolean; /* ... */ };
  storageAdapter?: StorageAdapter;
  notifyChannels?: Map<string, NotifyChannel>;
  jobHandlers?: JobHandlerMap;
}
```

## Platform 返回类型

```ts
interface Platform {
  system?: SystemModule;
  gen?: GenModule;
  monitor?: MonitorModule;
  notification?: NotificationModule;
  i18n?: I18nModule;
  workflow?: WorkflowModule;
  oss?: OSSModule;
  scheduler?: SchedulerModule;
  router: Router;
  init(): Promise<void>;
}
```

每个模块字段都是可选的，取决于是否在 `modules` 配置中启用。`router` 是所有已启用模块路由的聚合，可直接挂载到应用上。

## 模块开关

通过 `modules` 配置可按需启用或禁用模块。默认所有模块均为启用状态（`!== false`）：

```ts
const platform = await createPlatform({
  // ...其他依赖
  modules: {
    system: true,        // 系统管理（默认启用）
    gen: false,          // 禁用代码生成
    monitor: true,       // 监控（默认启用）
    notification: false, // 禁用通知
    i18n: true,          // 国际化（默认启用）
    workflow: true,      // 工作流（默认启用）
    oss: false,          // 禁用文件存储
    scheduler: true,     // 定时任务（默认启用）
  },
});
```

> `notification` 和 `oss` 模块除了开关外，还需要分别提供 `notifyChannels` 和 `storageAdapter`，否则即使开关为 `true` 也不会创建。

## 依赖关系图

`createPlatform` 内部根据配置创建各子模块，模块间共享底层依赖：

```
PlatformConfig
├── executor / db ──────────┐
├── cache ──────────────────┤
├── jwt + jwtSecret ────────┤
├── passwordHasher ─────────┤
├── rbac / rowFilter ───────┼──► createSystemModule()
├── authSessionManager ─────┤
├── tokenRefreshManager ────┤
├── sessionManager ─────────┤
├── multiDeviceManager ─────┘
│
├── executor + readTableSchema ──► createGenModule()
├── healthCheck ────────────────► createMonitorModule()
├── notifyChannels ─────────────► createNotificationModule()
│
├── db + jwt + rbac ────────────► createI18nModule()
├── db + jwt + rbac ────────────► createWorkflowModule()
├── storageAdapter ─────────────► createOSSModule()
└── scheduler + jobHandlers ────► createSchedulerModule()
```

所有模块的 `.router` 在创建后统一挂载到一个 `Router` 实例上，通过 `platform.init()` 按顺序初始化。

## 完整示例

```ts
import { createPlatform } from "@ventostack/boot";
import { createApp } from "@ventostack/core";

// 1. 准备所有依赖（此处为示意，具体实现取决于环境）
const config = {
  executor: mySqlExecutor,
  readTableSchema: myReadTableSchema,
  listTables: myListTables,
  cache: myCache,
  jwt: myJwtManager,
  jwtSecret: process.env.JWT_SECRET!,
  passwordHasher: myPasswordHasher,
  totpManager: myTotpManager,
  rbac: myRbac,
  rowFilter: myRowFilter,
  authSessionManager: myAuthSessionManager,
  tokenRefreshManager: myTokenRefreshManager,
  sessionManager: mySessionManager,
  multiDeviceManager: myMultiDeviceManager,
  auditStore: myAuditStore,
  eventBus: myEventBus,
  healthCheck: myHealthCheck,
  scheduler: myScheduler,
  modules: { gen: false, oss: false },
};

// 2. 创建平台
const platform = await createPlatform(config);

// 3. 初始化所有模块
await platform.init();

// 4. 挂载路由并启动
const app = createApp({ port: 3000 });
app.use(platform.router);
await app.listen();
```
