# Admin API — 代码生成约束

## 类型规则

- **后端路由必须定义请求/响应 Schema**（Zod / Valibot），以便 o2t 生成前端类型。当前缺失的 schema 是技术债，新增路由时必须补齐。
- Service 接口中的类型（Params/Item/ListParams）必须与数据库列名对齐，使用 camelCase。
- 数据库列名用 snake_case（如 `created_at`），Service 层做映射。

## Service 规则

- 工厂函数模式：`createXxxService(deps: { executor, cache? }): XxxService`
- ID 生成：`crypto.randomUUID()`（VARCHAR(36)）
- 软删除：`UPDATE SET deleted_at = NOW() WHERE deleted_at IS NULL`
- 动态 UPDATE：遍历 entries 跳过 undefined，拼接 `field = $N`
- 分页：`LIMIT/OFFSET` + 独立 `COUNT(*)`
- 缓存：读前 `cache.get`，写后 `cache.del`

```typescript
// ✅ 正确 — 工厂函数 + 依赖注入
export function createProductService(deps: { executor: SqlExecutor }): ProductService { ... }

// ❌ 错误 — 不要用 class
export class ProductService { ... }
```

## Route 规则

- 标准 CRUD 用 `createCrudRoutes({ basePath, resource, service, authMiddleware, perm })`
- 自定义路由用 `createRouter()` + `router.use(authMiddleware)`
- 权限格式：`system:xxx:list` / `query` / `create` / `update` / `delete`
- 响应用 `ok()` / `okPage()` / `fail()`，不要手动 `JSON.stringify`
- 请求体用 `parseBody(ctx.request)`，分页参数用 `pageOf(ctx.query)`

```typescript
// ✅ 正确
router.get("/api/system/products", perm("system", "product:list"), async (ctx) => {
  const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
  const result = await service.list({ page, pageSize });
  return okPage(result.items, result.total, result.page, result.pageSize);
});

// ❌ 错误 — 不要手动构建响应
return new Response(JSON.stringify({ ... }));
```

## Migration / Seed 规则

- Migration：`{ name, up(executor), down(executor) }`，纯 SQL
- Seed：`{ name, run(executor) }`，用 `ON CONFLICT DO NOTHING` 保证幂等
- Seed 写 system 表必须显式携带 `tenant_id = env.TENANT_ID`（SELECT/INSERT 均限定租户）；幂等 `ON CONFLICT` 的冲突目标必须是迁移 016 之后的租户复合唯一键（如 `(tenant_id, key)`、`(tenant_id, code)`），引用已删除的单列唯一约束会导致启动失败（42P10）
- 新增 Migration/Seed 后必须在 `apps/admin/api/src/database/` 对应目录下添加文件并注册

## 禁止

- 不要用 class、装饰器、DI 容器
- 不要用字符串拼接 SQL，必须参数化 `$1, $2, ...`
- 不要在 Handler 里直接写 SQL，逻辑放 Service
- 不要引入 Express/Fastify/Koa 风格抽象
- 不要用 `any` 类型
