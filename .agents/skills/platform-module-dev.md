---
name: platform-module-dev
description: |
  开发或修改 @ventostack/* 平台层模块时必须遵循的规范。
  涵盖模块结构、模型、Service、路由、中间件、权限、测试、注册流程。
  适用于新增 platform 模块或修改现有模块（system/auth/oss/scheduler 等）。
---

# Platform Module — AI Agent 编码规范

## 模块标准结构

```
packages/platform/xxx/
├── src/
│   ├── models/         # defineModel 定义表结构
│   ├── services/       # createXxxService 工厂函数
│   ├── routes/         # API 路由定义
│   ├── middlewares/    # 模块级中间件（auth-guard.ts 必须存在）
│   ├── migrations/     # 数据库迁移
│   ├── seeds/          # 种子数据
│   ├── __tests__/      # 测试文件
│   ├── module.ts       # createXxxModule 工厂
│   └── index.ts        # 统一导出
├── package.json
└── tsconfig.json
```

## 核心原则

1. **依赖约束**: 只依赖 core + database + auth，特殊情况可依赖 cache/events/observability。
2. **函数式优先**: 禁止 class，Service 用工厂函数返回接口实现。
3. **权限统一**: 必须使用 `createPermMiddleware` 工厂，禁止内联权限中间件。
4. **响应统一**: 使用 `ok` / `okPage` / `fail` 响应封装。
5. **表名规范**: 平台层表名 `sys_` 前缀。

## 模型（models/xxx.ts）

```typescript
import { defineModel, column } from "@ventostack/database";

export const XxxModel = defineModel("sys_xxx", {
  id: column.string({ primaryKey: true }),
  name: column.string({ maxLength: 128, nullable: false }),
  sort: column.integer({ default: 0 }),
  status: column.integer({ default: 1 }),
  remark: column.string({ maxLength: 512, nullable: true }),
  deletedAt: column.timestamp({ nullable: true, softDelete: true }),
  createdAt: column.timestamp({ default: "now" }),
  updatedAt: column.timestamp({ default: "now" }),
});
```

## Service（services/xxx.ts）

```typescript
import type { Database } from "@ventostack/database";
import { XxxModel } from "../models/xxx";

export interface XxxService {
  list(params: { page: number; pageSize: number; keyword?: string }): Promise<{ items: XxxItem[]; total: number }>;
  getById(id: string): Promise<XxxItem | null>;
  create(data: CreateXxxParams): Promise<string>;
  update(id: string, data: Partial<CreateXxxParams>): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface XxxItem {
  id: string;
  name: string;
  sort: number;
  status: number;
  remark: string | null;
  createdAt: Date;
}

export interface CreateXxxParams {
  name: string;
  sort?: number;
  status?: number;
  remark?: string;
}

export function createXxxService(deps: { db: Database }): XxxService {
  const { db } = deps;
  return {
    async list(params) {
      const query = db.query(XxxModel).where("deleted_at", "IS", null);
      if (params.keyword) {
        query.where("name", "like", `%${params.keyword}%`);
      }
      const total = await query.count();
      const items = await query
        .select("*")
        .orderBy("sort", "asc")
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize)
        .execute();
      return { items: items as XxxItem[], total };
    },

    async getById(id) {
      const rows = await db.query(XxxModel)
        .select("*")
        .where("id", "=", id)
        .where("deleted_at", "IS", null)
        .limit(1)
        .execute();
      return (rows[0] as XxxItem | undefined) ?? null;
    },

    async create(data) {
      const id = crypto.randomUUID();
      await db.query(XxxModel).insert({ id, ...data, createdAt: new Date(), updatedAt: new Date() });
      return id;
    },

    async update(id, data) {
      await db.query(XxxModel)
        .where("id", "=", id)
        .update({ ...data, updatedAt: new Date() });
    },

    async delete(id) {
      await db.query(XxxModel)
        .where("id", "=", id)
        .update({ deletedAt: new Date() });
    },
  };
}
```

## 权限中间件（middlewares/auth-guard.ts）

```typescript
import type { Middleware } from "@ventostack/core";
import type { RBAC } from "@ventostack/auth";
import { forbidden, unauthorized } from "@ventostack/core";

export function createPermMiddleware(rbac?: RBAC): (resource: string, action: string) => Middleware {
  return (resource: string, action: string): Middleware => {
    return async (ctx, next) => {
      const user = ctx.user as AuthUser | undefined;
      if (!user) return unauthorized();
      if (rbac) {
        if (user.roles.includes("admin")) return next(); // 超管跳过
        if (!user.roles.some(role => rbac.hasPermission(role, resource, action))) {
          return forbidden();
        }
      }
      return next();
    };
  };
}
```

**禁止**在 `module.ts` 或路由文件中内联 `(ctx: any, next: any)` 权限中间件。

## 路由（routes/xxx.ts）

```typescript
import { createRouter } from "@ventostack/core";
import type { XxxService } from "../services/xxx";
import { createPermMiddleware } from "../middlewares/auth-guard";
import { ok, okPage, fail } from "./common";

export function createXxxRoutes(service: XxxService, perm: ReturnType<typeof createPermMiddleware>) {
  const router = createRouter();

  router.get("/api/system/xxx", perm("system:xxx:list"), async (ctx) => {
    const { page = "1", pageSize = "10", keyword } = ctx.query;
    const result = await service.list({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword: keyword as string | undefined,
    });
    return okPage(result.items, result.total, Number(page), Number(pageSize));
  });

  router.get("/api/system/xxx/:id", perm("system:xxx:detail"), async (ctx) => {
    const item = await service.getById(ctx.params.id as string);
    if (!item) return fail("记录不存在", 404);
    return ok(item);
  });

  router.post("/api/system/xxx", perm("system:xxx:create"), async (ctx) => {
    const id = await service.create(ctx.body as CreateXxxParams);
    return ok({ id }, 201);
  });

  router.put("/api/system/xxx/:id", perm("system:xxx:update"), async (ctx) => {
    await service.update(ctx.params.id as string, ctx.body as Partial<CreateXxxParams>);
    return ok();
  });

  router.delete("/api/system/xxx/:id", perm("system:xxx:delete"), async (ctx) => {
    await service.delete(ctx.params.id as string);
    return ok();
  });

  return router;
}
```

## 响应封装（routes/common.ts）

```typescript
export function ok(data?: unknown, status = 200) {
  return Response.json({ code: 0, message: "success", data }, { status });
}

export function okPage(list: unknown[], total: number, page: number, pageSize: number) {
  return Response.json({
    code: 0,
    message: "success",
    data: { list, total, page, pageSize },
  });
}

export function fail(message: string, status = 400, code = 1) {
  return Response.json({ code, message, data: null }, { status });
}
```

## Module 聚合（module.ts）

```typescript
import { createRouter } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import type { RBAC } from "@ventostack/auth";
import { createXxxService } from "./services/xxx";
import { createXxxRoutes } from "./routes/xxx";
import { createPermMiddleware } from "./middlewares/auth-guard";

export interface XxxModule {
  router: ReturnType<typeof createRouter>;
}

export interface XxxModuleDeps {
  db: Database;
  rbac?: RBAC;
}

export function createXxxModule(deps: XxxModuleDeps): XxxModule {
  const service = createXxxService({ db: deps.db });
  const perm = createPermMiddleware(deps.rbac);
  const router = createXxxRoutes(service, perm);
  return { router };
}
```

## 注册到 Boot

新增模块必须在 `packages/platform/boot/src/create-platform.ts` 中：

1. 导入 `createXxxModule`
2. 在 `PlatformConfig` 接口添加依赖配置
3. 在 `createPlatform()` 中创建并挂载
4. 在 `modules` 开关中添加 `xxx?: boolean`
5. 在 `Platform` 接口中添加 `xxx?: XxxModule`

## 测试（__tests__/xxx.test.ts）

```typescript
import { describe, test, expect } from "bun:test";
import { createMockDatabase } from "@ventostack/testing";
import { createXxxService } from "../services/xxx";

describe("XxxService", () => {
  const { db, registerModel } = createMockDatabase(async () => []);
  registerModel(XxxModel);
  const service = createXxxService({ db });

  test("create and get", async () => {
    const id = await service.create({ name: "Test" });
    const item = await service.getById(id);
    expect(item?.name).toBe("Test");
  });
});
```

## 禁止事项

- ❌ 在 module.ts 中内联权限中间件
- ❌ 手写 `ok` / `fail` 而不是导入 common
- ❌ Service 中使用 `any` 类型
- ❌ 路由中拼接 SQL 或 URL
- ❌ 模型中缺少 `deletedAt` 软删除字段
- ❌ 迁移文件缺少 `down()`
- ❌ 种子数据不用 `ON CONFLICT DO NOTHING`
