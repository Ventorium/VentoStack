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

### Admin 多租户硬约束

- **默认租户资源**：所有 Admin 非公开实体默认归属 tenant，表必须包含非空 `tenant_id`；全局资源必须有显式白名单和安全理由。
- **可信来源**：`tenantId` 只能由认证上下文与数据库实时租户成员校验生成；不得信任 Header、Path、Query、Body 或旧 JWT 快照中的租户归属。
- **fail-closed**：缺失 tenant、租户/成员停用或校验异常时必须拒绝请求，不得回退为无 tenant 查询或 `default` tenant。
- **Service 强制 scope**：Service 必须接收不可缺省的 `TenantScope`；列表/count/详情/创建/更新/删除/批量/导入导出/树形/统计/关联查询全部在 SQL 层携带 `tenant_id`。
- **所有权由服务端写入**：Create 由服务端注入 `tenant_id`，请求 Schema 必须拒绝客户端传入 tenant 归属字段。
- **跨租户不可枚举**：Update/Delete 使用 `WHERE id = ? AND tenant_id = ?`；跨 tenant 与不存在资源对外统一 404。
- **关联同 tenant**：角色、菜单、部门、岗位、标签、公告等关联写入必须校验两端属于同 tenant，并优先用 `(tenant_id, id)` 复合约束兜底。
- **Raw SQL**：必须包含参数化 tenant 条件、说明租户策略并有跨 tenant 回归测试；未说明租户策略的 raw SQL 不得合并。
- **全链路 namespace**：缓存、操作/登录/审计日志、导出文件、对象存储、队列、定时任务和幂等键全部包含 tenant namespace。
- **OpenAPI**：每个非公开端点必须说明 tenant 由当前认证上下文确定、客户端不得传入 `tenantId`、跨 tenant 资源按 404 处理。
- **回归测试**：每个 Admin 端点至少覆盖同 tenant 成功、跨 tenant 读写失败、tenant 缺失/失效 fail-closed，并覆盖批量、关联、统计、导入导出。

### 模块安全契约（2026-09 模块交叉审查）

以下规则来自第三轮模块审查（config / dict / notice / tag 教训），新增或修改实体时逐条对照：

**数据权限与端点语义**

- **用户关联查询必须带数据范围**：接口若返回用户 ID 列表或按用户维度聚合数据（标签反查用户、通知接收人等），必须把当前操作者传入 service，并与 `DataScopeResolver` 解析的部门/本人范围取交集；`ALL` 以外 fail-closed，解析异常整体拒绝，不回退全量。
- **个人/管理端点分离**：管理端点要求 `system:*` 权限并应用数据范围；个人视角走 `/api/system/user/**` 自助端点，服务端强制注入 `ctx.user.id`，不接受前端传 userId。禁止一个端点同时承担两种视角。
- **敏感配置是控制面**：影响认证安全的配置键（初始密码、密码长度/复杂度、MFA、Passkey、锁定策略）读改需要数据库实时 admin（`governance.adminOnlyMiddleware`）；列表响应脱敏，编辑空值表示"不修改"，不得把掩码写回数据库；变更写独立审计事件（旧/新值摘要，不记明文）。配置应声明集中式元数据（category: public/business/security/secret、mutable、deletable），不散落 `PROTECTED_KEYS`。

**Service 层真实契约**

- **`getById` 必须真实**：用路径参数查询目标；禁止用 `list({ page: 1, pageSize: 1 })` 第一条伪造详情（字典类型教训）。资源主键统一 UUID；需要按 code 操作时提供显式 `/by-code/:code` 端点。
- **字段名契约**：HTTP body 字段名与 service 参数名必须一致或显式映射；禁止 `dictService.createData(body as CreateDictDataParams)` 这种断言桥接（dictType/typeCode 教训）。必须有真实 HTTP 集成测试断言最终 INSERT 的列值。
- **状态机下沉 service**：有状态实体（如公告 0 草稿 → 1 已发布 → 2 已撤回）用条件更新 `WHERE id = ? AND status = 期望值` 实现，affected rows 为 0 返回 404 或冲突；`markRead` 等操作仅对合法状态生效；禁止路由层"先查后改"承担状态校验（存在并发竞争）。
- **全量覆盖写入事务化**：assignRoles / assignTags / assignMenus 类接口先校验目标存在、启用、去重，再在同一 `db.transaction` 内删除旧关系 + `batchInsert` 新关系；禁止非事务先删后插、循环单条写入。
- **affected rows 必检**：update/delete 后检查影响行数，目标不存在返回 404，不静默成功。

**数据库完整性**

- **关联表必须外键**：用户标签、用户通知等关联表补 `ON DELETE CASCADE/RESTRICT` 外键；新增外键迁移先扫描孤儿数据，发现脏数据主动 `RAISE EXCEPTION`，不静默清理。软删除不触发 cascade，service 删除时显式清理关联行。
- **父引用校验**：创建子记录（字典数据等）前必须确认父类型存在且启用，不能只依赖数据库报错。

**输入边界与前后端契约**

- **Schema 边界统一**：字符串按模型列长设 `max`（name/code 常用 64/128，remark 512）；`sort: min 0, max 9999`；`status: enum [0,1]`（特殊实体显式声明枚举，如公告 `[0,1,2]`、类型 `[1,2,3]`）；批量 IDs 用 `items: { type: 'uuid' }, min: 1, max: 100`；大文本字段（公告 content）设上限（如 64 KiB）。
- **listQuery 与前端搜索对齐**：后端 `listQuery` 白名单必须覆盖前端全部搜索字段且类型一致；strict 校验下未声明字段直接 400（配置页传 name/key 被拒的教训）。筛选用 ORM 参数化表达。
- **前后端类型一致**：同一字段在前端、Schema、数据库中类型必须一致（配置 `type` int/string 混用教训）；create/update body 覆盖前端实际提交的全部字段。
- **OpenAPI 描述完整**：summary 说明权限标识、数据范围语义、租户由认证上下文确定、跨租户 404、敏感值脱敏行为；功能变更同步更新 `apps/docs` 对应模块文档。
