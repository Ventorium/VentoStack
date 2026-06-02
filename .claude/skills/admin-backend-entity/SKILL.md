---
name: admin-backend-entity
description: 创建后端完整实体（Migration + Seed + Service + Routes）。当需要新增一个系统管理实体的后端能力时调用。涵盖从数据库表到 API 路由的全流程，以及注册与导出步骤。
---

# Admin Backend Entity — 后端实体创建全流程

## When To Use

- 新增一个系统管理实体（如 Product、Category、Tag）
- 需要数据库表 + 迁移 + 种子数据 + Service + API 路由

## Step 1: Migration

文件：`packages/platform/system/src/migrations/NNN_create_sys_xxx.ts`

```typescript
import type { Migration } from "@ventostack/database"

export const createSysXxx: Migration = {
  name: "NNN_create_sys_xxx",

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_xxx (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        sort INT NOT NULL DEFAULT 0,
        status INT NOT NULL DEFAULT 1,
        remark VARCHAR(512),
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
  },

  async down(executor) {
    await executor(`DROP TABLE IF EXISTS sys_xxx`)
  },
}
```

**约定**：
- 表名 `sys_` 前缀
- 必须有 `id VARCHAR(36) PRIMARY KEY`、`deleted_at TIMESTAMP`（软删除）、`created_at`、`updated_at`
- `down()` 必须能完整回滚

## Step 2: Seed（可选）

文件：`packages/platform/system/src/seeds/NNN_init_xxx.ts`

```typescript
import type { Seed } from "@ventostack/database"

export const initXxxSeed: Seed = {
  name: "NNN_init_xxx",

  async run(executor) {
    await executor(
      `INSERT INTO sys_xxx (id, name, status, deleted_at) VALUES ($1, $2, $3, NULL)
       ON CONFLICT (id) DO NOTHING`,
      [crypto.randomUUID(), "示例数据", 1],
    )
  },
}
```

**约定**：用 `ON CONFLICT DO NOTHING` 保证幂等。

## Step 3: Service

文件：`packages/platform/system/src/services/xxx.ts`

```typescript
import type { SqlExecutor } from "@ventostack/database"
import type { Cache } from "@ventostack/cache"

// 参数接口
export interface CreateXxxParams { name: string; sort?: number; status?: number; remark?: string }
export interface UpdateXxxParams { name?: string; sort?: number; status?: number; remark?: string }
export interface XxxListParams { page?: number; pageSize?: number; name?: string; status?: number }

// Service 接口
export interface XxxService {
  create(params: CreateXxxParams): Promise<{ id: string }>
  update(id: string, params: UpdateXxxParams): Promise<void>
  delete(id: string): Promise<void>
  getById(id: string): Promise<Record<string, unknown> | null>
  list(params: XxxListParams): Promise<{ items: unknown[]; total: number; page: number; pageSize: number; totalPages: number }>
}

// 工厂函数
export function createXxxService(deps: { executor: SqlExecutor; cache?: Cache }): XxxService {
  const { executor, cache } = deps

  return {
    async create(params) {
      const id = crypto.randomUUID()
      await executor(
        `INSERT INTO sys_xxx (id, name, sort, status, remark, deleted_at) VALUES ($1, $2, $3, $4, $5, NULL)`,
        [id, params.name, params.sort ?? 0, params.status ?? 1, params.remark ?? null],
      )
      if (cache) await cache.del("xxx:list")
      return { id }
    },

    async update(id, params) {
      const fields: string[] = []
      const values: unknown[] = []
      let idx = 1
      const updatable: Record<string, unknown> = { name: params.name, sort: params.sort, status: params.status, remark: params.remark }
      for (const [field, value] of Object.entries(updatable)) {
        if (value !== undefined) { fields.push(`${field} = $${idx++}`); values.push(value) }
      }
      if (fields.length === 0) return
      fields.push(`updated_at = NOW()`)
      values.push(id)
      await executor(`UPDATE sys_xxx SET ${fields.join(", ")} WHERE id = $${idx} AND deleted_at IS NULL`, values)
      if (cache) { await cache.del(`xxx:detail:${id}`); await cache.del("xxx:list") }
    },

    async delete(id) {
      await executor(`UPDATE sys_xxx SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id])
      if (cache) { await cache.del(`xxx:detail:${id}`); await cache.del("xxx:list") }
    },

    async getById(id) {
      const rows = await executor(
        `SELECT * FROM sys_xxx WHERE id = $1 AND deleted_at IS NULL`, [id]
      ) as Array<Record<string, unknown>>
      return rows.length === 0 ? null : rows[0]!
    },

    async list(params) {
      const { page = 1, pageSize = 10, name, status } = params
      const conditions: string[] = ["deleted_at IS NULL"]
      const values: unknown[] = []
      let idx = 1
      if (name) { conditions.push(`name LIKE $${idx++}`); values.push(`%${name}%`) }
      if (status !== undefined) { conditions.push(`status = $${idx++}`); values.push(status) }
      const where = conditions.join(" AND ")
      const countRows = await executor(`SELECT COUNT(*) as total FROM sys_xxx WHERE ${where}`, values)
      const total = (countRows as Array<{ total: number }>)[0]?.total ?? 0
      const offset = (page - 1) * pageSize
      const rows = await executor(
        `SELECT * FROM sys_xxx WHERE ${where} ORDER BY sort ASC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, pageSize, offset],
      )
      return { items: rows as unknown[], total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 }
    },
  }
}
```

**关键约定**：
- 工厂函数，不要 class
- `crypto.randomUUID()` 生成 ID
- 软删除用 `deleted_at IS NULL` 条件
- 动态 UPDATE 遍历 entries 跳过 undefined
- 分页用 `LIMIT/OFFSET` + 独立 `COUNT(*)`

## Step 4: Routes

标准 CRUD 直接在 `module.ts` 中用 `createCrudRoutes`：

```typescript
// module.ts
import { createXxxService } from "./services/xxx"

const xxxService = createXxxService({ executor, cache })

router.merge(createCrudRoutes({
  basePath: "/api/system/xxx",
  resource: "system:xxx",
  service: xxxService,
  authMiddleware,
  perm,
  extraRoutes: (r) => {
    // 添加自定义路由（如需要）
  },
}))
```

自动生成 5 条路由：

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/system/xxx` | `system:xxx:list` |
| GET | `/api/system/xxx/:id` | `system:xxx:query` |
| POST | `/api/system/xxx` | `system:xxx:create` |
| PUT | `/api/system/xxx/:id` | `system:xxx:update` |
| DELETE | `/api/system/xxx/:id` | `system:xxx:delete` |

如需自定义路由（如批量操作、状态变更），创建 `routes/xxx.ts`：

```typescript
import { createRouter } from "@ventostack/core"
import type { Middleware, Router } from "@ventostack/core"
import type { XxxService } from "../services/xxx"
import { ok, fail, parseBody } from "./common"

export function createXxxRoutes(
  service: XxxService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter()
  router.use(authMiddleware)
  // 自定义路由...
  return router
}
```

## Step 5: 注册 & 导出

1. **平台包导出** — `packages/platform/system/src/index.ts`：
   ```typescript
   export { createSysXxx } from './migrations/NNN_create_sys_xxx'
   export { initXxxSeed } from './seeds/NNN_init_xxx'
   export { createXxxService } from './services/xxx'
   export type { XxxService, CreateXxxParams, UpdateXxxParams, XxxListParams } from './services/xxx'
   ```

2. **Migration 注册** — `apps/admin/api/src/database/migrations.ts`：
   ```typescript
   import { createSysXxx } from "@ventostack/system"
   runner.addMigration(createSysXxx)
   ```

3. **Seed 注册** — `apps/admin/api/src/database/seeds.ts`：
   ```typescript
   import { initXxxSeed } from "@ventostack/system"
   runner.addSeed(initXxxSeed)
   ```

4. **Module 注册** — `packages/platform/system/src/module.ts`：
   - 创建 service 实例
   - 用 `createCrudRoutes` 或自定义 routes 注册路由
   - 添加到 `services` 返回值

5. **菜单 & 权限** — 在 `initAdminSeed` 中添加菜单项和按钮权限，权限格式 `system:xxx:list` 等。

## 响应工具函数速查

```typescript
import { ok, okPage, fail, parseBody, pageOf } from "./common"

ok(data)                              // { code: 0, message: "success", data }
okPage(list, total, page, pageSize)   // { code: 0, data: { list, total, page, pageSize, totalPages } }
fail("Not found", 404, 404)           // { code: 404, message: "Not found", data: null }
parseBody<T>(request)                 // 读取请求体 JSON → T
pageOf(query)                         // { page: 1, pageSize: 10 } (page ≥ 1, pageSize 1-100)
```

## 安全约束（Security Audit）

新增实体时必须遵守以下安全规则：

### 路由安全

- **新增路由必须在 protected router 上**：所有非公开 API 必须挂载在经 `authMiddleware` 保护的 router 上，或使用 `createCrudRoutes` 自动注入认证。
- **必须添加权限标识符**：每条路由必须携带 `perm("system:xxx:action")` 权限中间件，禁止裸路由。权限格式：`system:模块:list` / `query` / `create` / `update` / `delete`。

### Schema 安全

- **Schema strict 模式默认开启**：路由 config 中的 `strict` 默认 `true`（拒绝未知字段），不要显式设为 `false`。
- **必须定义请求/响应 Schema**：新增路由的 `body`、`query`、`formData` 必须声明 Schema，以便运行时校验和前端类型生成。

### 审计与脱敏

- **审计日志 metadata 自动脱敏**：通过 `createOperationLogMiddleware` 记录的操作日志，请求体中 31 个敏感字段（password、token、secret 等）会被自动替换为 `"******"`，无需手动处理。
- **日志中禁止输出敏感数据**：Service 层的 `console.log` / `logger` 调用不应包含 password、token 等字段。

### SQL 安全

- **参数化查询强制**：所有 SQL 使用 `$1, $2, ...` 占位符，禁止字符串拼接。动态字段名使用 `assertValidIdentifier` 校验。
