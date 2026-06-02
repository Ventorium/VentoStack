---
name: platform-module
description: 新增平台模块的完整流程。涵盖 models/services/routes/middlewares/module.ts/index.ts 的标准模板，以及在 boot 中注册、在 admin 中启用的步骤。当需要创建新的 @ventostack/* 平台模块时调用。
---

# Platform Module — 新增平台模块全流程

## When To Use

- 创建新的 `packages/platform/xxx/` 模块
- 需要完整的 models + services + routes + module 结构

## 标准目录结构

```
packages/platform/xxx/
├── src/
│   ├── models/
│   │   └── xxx.ts           # defineModel 定义表结构
│   ├── services/
│   │   └── xxx.ts           # createXxxService 工厂函数
│   ├── routes/
│   │   ├── xxx.ts           # API 路由定义
│   │   └── common.ts        # ok/okPage/fail 等响应工具
│   ├── middlewares/
│   │   └── auth-guard.ts    # createAuthMiddleware + createPermMiddleware
│   ├── migrations/
│   │   └── 001_create_xxx_tables.ts
│   ├── __tests__/
│   │   ├── xxx.test.ts
│   │   └── helpers.ts       # createMockDatabase 等测试辅助
│   ├── module.ts            # createXxxModule 聚合
│   └── index.ts             # 统一导出
├── package.json
└── tsconfig.json
```

## Step 1: Model

```typescript
// models/xxx.ts
import { defineModel, column } from "@ventostack/database";

export const XxxModel = defineModel("sys_xxx", {
  id: column.string({ primaryKey: true }),
  name: column.string({ maxLength: 128 }),
  sort: column.integer({ default: 0 }),
  status: column.integer({ default: 1 }),
  remark: column.string({ maxLength: 512, nullable: true }),
  deletedAt: column.timestamp({ nullable: true, softDelete: true }),
  createdAt: column.timestamp({ default: "now" }),
  updatedAt: column.timestamp({ default: "now" }),
});
```

## Step 2: Service

```typescript
// services/xxx.ts
import type { Database } from "@ventostack/database";
import { XxxModel } from "../models/xxx";

export interface XxxService {
  list(params: { page: number; pageSize: number }): Promise<{ items: unknown[]; total: number }>;
  getById(id: string): Promise<unknown | null>;
  create(data: { name: string; sort?: number }): Promise<string>;
  update(id: string, data: Partial<{ name: string; sort: number; status: number }>): Promise<void>;
  delete(id: string): Promise<void>;
}

export function createXxxService(deps: { db: Database }): XxxService {
  const { db } = deps;
  return {
    async list(params) {
      const total = await db.query(XxxModel).count();
      const items = await db.query(XxxModel)
        .select("*")
        .orderBy("sort", "asc")
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize)
        .execute();
      return { items, total };
    },
    async getById(id) {
      return db.query(XxxModel).where("id", "=", id).first();
    },
    async create(data) {
      const id = crypto.randomUUID();
      await db.query(XxxModel).insert({ id, ...data });
      return id;
    },
    async update(id, data) {
      await db.query(XxxModel).where("id", "=", id).update(data);
    },
    async delete(id) {
      await db.query(XxxModel).where("id", "=", id).update({ deletedAt: new Date() });
    },
  };
}
```

## Step 3: auth-guard.ts

使用 `createAuthMiddleware` + `createPermMiddleware` 标准模式。
参考 `packages/platform/system/src/middlewares/auth-guard.ts`。

## Step 4: Module

```typescript
// module.ts
import type { JWTManager, RBAC } from "@ventostack/auth";
import type { Router } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
import { createXxxRoutes } from "./routes/xxx";
import { createXxxService } from "./services/xxx";
import type { XxxService } from "./services/xxx";

export interface XxxModule {
  services: { xxx: XxxService };
  router: Router;
  init(): Promise<void>;
}

export interface XxxModuleDeps {
  db: Database;
  jwt: JWTManager;
  jwtSecret: string;
  rbac?: RBAC;
}

export function createXxxModule(deps: XxxModuleDeps): XxxModule {
  const { db, jwt, jwtSecret, rbac } = deps;
  const service = createXxxService({ db });
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);
  const router = createXxxRoutes(service, authMiddleware, perm);
  return { services: { xxx: service }, router, async init() {} };
}
```

## Step 5: Register in Boot

在 `packages/platform/boot/src/create-platform.ts` 中：
1. 导入 `createXxxModule`
2. `PlatformConfig` 添加 `xxx?: boolean` 开关
3. `createPlatform()` 中创建并挂载到聚合路由

## Step 6: Enable in Admin

在 `apps/admin/api/src/app.ts` 的 `modules` 配置中：
```typescript
modules: {
  xxx: true,
}
```

## 关键约束

- 禁止 `class`，用 `createXxx()` 工厂函数
- 禁止 `any`，用 `unknown` + 类型收窄
- 禁止内联 `(ctx: any, next: any)` 权限中间件，用 `createPermMiddleware`
- 表名 `sys_` 前缀，列名 snake_case，TS 字段 camelCase
- 测试用 `createMockDatabase(createMockExecutor())`

## 安全约束（Security Audit）

新增平台模块时必须遵守以下安全规则：

### 租户隔离配置

- `createPlatform()` 中通过 `tenantEnabled: true` 启用多租户模式（默认 `false`，向后兼容）
- 启用后 `createTenantMiddleware` 自动从 JWT 注入 `tenant_id`，不依赖前端传递
- Service 层查询必须调用 `db.query(Model).withTenant(tenantId)` 注入租户条件
- 缓存键必须使用 `createCacheKeyNamespace(tenantId)` 生成带租户前缀的键：`tenant:${tenantId}:原始键`

### 管理端点独立端口

- 模块中的健康检查、指标、调试端点必须挂载在独立的管理端口（`ADMIN_PORT`）
- 生产环境禁止将管理端点暴露在业务端口上
- `ADMIN_PORT = 0` 时所有端点在同一端口，不推荐生产使用

### 安全中间件注册要求

- **认证中间件必挂**：所有非公开 API 的路由组必须先 `router.use(authMiddleware)`
- **权限标识符必填**：使用 `createPermMiddleware(rbac)` 工厂，每条路由绑定 `perm("resource:action")`
- **Schema strict 默认开启**：路由 config 中 `strict` 默认 `true`，不要显式关闭
- **审计日志集成**：写操作路由组应挂载 `createOperationLogMiddleware(auditLog, { trustedProxies })`，确保操作可审计且自动脱敏
- **可信代理配置透传**：`trustedProxies` 从 `PlatformConfig` 传入各模块，用于安全提取客户端 IP

### Row Filter 与数据隔离

- 模块中涉及数据行级过滤的场景，必须使用 `createRowFilter()` + `buildWhereClause()` 参数化查询
- 禁止在 Row Filter 中使用字符串拼接生成 SQL 条件
