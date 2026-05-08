---
order: 1
title: 系统管理概述
description: '@ventostack/system 提供企业级系统管理能力，包括用户、角色、权限、部门、字典、配置等核心业务模块。'
---

## 概述

`@ventostack/system` 是 VentoStack 平台层的系统管理模块，基于框架层的核心包构建，提供开箱即用的企业级后台管理能力。

它不是框架层的一部分，而是建立在框架层之上的业务级封装，将 `@ventostack/auth`、`@ventostack/database`、`@ventostack/cache`、`@ventostack/observability` 等底层能力组合成完整的系统管理解决方案。

## 架构定位

```
┌──────────────────────────────────────────────────┐
│              @ventostack/system                   │
│  (用户 / 角色 / 菜单 / 部门 / 字典 / 配置 / 通知)  │
├──────────────────────────────────────────────────┤
│  auth    │  database  │  cache  │  observability │
├──────────────────────────────────────────────────┤
│                   core                           │
└──────────────────────────────────────────────────┘
```

系统管理模块依赖关系：

- **@ventostack/auth** — 认证鉴权、RBAC 权限引擎、会话管理
- **@ventostack/database** — 数据持久化、事务管理、分页查询
- **@ventostack/cache** — 字典缓存、配置缓存、权限缓存
- **@ventostack/observability** — 操作审计、日志记录
- **@ventostack/events** — 事件总线

## 快速开始

### 创建系统模块

`createSystemModule` 需要注入所有底层引擎实例。推荐使用 `@ventostack/boot` 的 `createPlatform()` 自动完成组装（见 [平台引导](/framework/guides/getting-started)），也可以手动组装：

```typescript
import { createSystemModule } from '@ventostack/system';
import { createDatabase, createSqlExecutor } from '@ventostack/database';
import { createCache, createRedisAdapter, createRedisClient } from '@ventostack/cache';
import {
  createJWT, createPasswordHasher, createRBAC, createRowFilter,
  createTOTP, createSessionManager, createMemorySessionStore,
  createMultiDeviceManager, createTokenRefresh,
  createAuthSessionManager, createMemoryRevocationStore,
} from '@ventostack/auth';
import { createAuditLog } from '@ventostack/observability';
import { createEventBus } from '@ventostack/events';

// 基础设施
const sql = createSqlExecutor('postgres://...');
const db = createDatabase({ executor: sql.executor });
const redis = createRedisClient({ url: 'redis://...' });
const cache = createCache(createRedisAdapter({ client: redis }));

// 认证引擎
const jwtSecret = process.env.JWT_SECRET!;
const jwt = createJWT({ secret: jwtSecret });
const passwordHasher = createPasswordHasher();
const totp = createTOTP({ issuer: 'MyApp' });
const rbac = createRBAC();
const rowFilter = createRowFilter();
const sessionManager = createSessionManager(createMemorySessionStore());
const deviceManager = createMultiDeviceManager({ maxDevices: 5 });
const tokenRefresh = createTokenRefresh(jwt);
const authSessionManager = createAuthSessionManager({
  sessionManager, deviceManager, tokenRefresh,
  jwt, jwtSecret,
});

// 其他依赖
const auditLog = createAuditLog();
const eventBus = createEventBus();

// 创建系统模块
const system = createSystemModule({
  db, cache, jwt, jwtSecret, passwordHasher,
  totp, rbac, rowFilter, sessionManager,
  deviceManager, tokenRefresh, authSessionManager,
  auditLog, eventBus,
});

// 注册路由
app.use(system.router);

// 初始化（加载权限等）
await system.init();
```

应用自己的初始化数据、菜单树和迁移注册应放在应用层维护；`@ventostack/system` 负责服务、路由、中间件和模型封装。

### 数据库表命名约定

所有系统管理相关的数据库表统一使用 `sys_` 前缀：

| 表名 | 说明 |
|------|------|
| `sys_user` | 用户表 |
| `sys_role` | 角色表 |
| `sys_menu` | 菜单权限表 |
| `sys_dept` | 部门表 |
| `sys_post` | 岗位表 |
| `sys_dict_type` | 字典类型表 |
| `sys_dict_data` | 字典数据表 |
| `sys_config` | 系统参数表 |
| `sys_notice` | 通知公告表 |
| `sys_user_role` | 用户角色关联表 |
| `sys_user_post` | 用户岗位关联表 |
| `sys_role_menu` | 角色菜单关联表 |
| `sys_role_dept` | 角色部门关联表（数据权限） |

### 模块内部结构

`createSystemModule` 内部自动创建并组装以下服务，无需手动传递：

```
createSystemModule(deps) 内部创建:
├── authService         // 认证（登录/注册/MFA/Passkey）
├── userService         // 用户管理
├── roleService         // 角色管理
├── menuService         // 菜单管理
├── deptService         // 部门管理
├── postService         // 岗位管理
├── dictService         // 字典管理
├── configService       // 参数配置
├── noticeService       // 通知公告
├── permissionLoader    // 权限加载器
├── menuTreeBuilder     // 菜单树构建器
└── passkeyService      // Passkey/WebAuthn
```

返回的 `system.services` 对象包含所有服务实例，可用于进一步扩展。

## 多租户支持

多租户通过 `@ventostack/core` 的 `createTenantMiddleware` 实现，在路由层自动注入租户上下文。系统模块的所有数据查询会自动携带租户隔离条件。详见 [多租户中间件](/framework/core/middleware/) 文档。
