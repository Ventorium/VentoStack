# Admin 其他系统模块安全与多租户整改方案

## 1. 背景

用户、角色、部门、菜单已完成数据权限与身份安全加固后，继续审查 Admin 中的岗位、字典、系统配置、公告、标签和日志模块。审查发现它们存在控制面权限、数据范围、前后端契约、状态机、关联完整性、输入边界与 raw SQL 使用问题。

更重要的是，当前 `TENANT_ENABLED` 只影响部分缓存键和 token 字段，`sys_*` 数据表普遍没有 `tenant_id`，应用组装处也明确标注“不提供真实隔离”。因此本次整改不得将“缓存键有 tenant 前缀”误当作多租户完成。

## 2. 总体不变量

1. 所有 Admin 非公开操作必须关联经服务端验证的 `tenantId`。
2. 当前阶段 `tenantId` 来自部署配置 `TENANT_ID`，并与数据库用户及 JWT tenant claim 实时比对；不信任客户端输入，也不单独信任 JWT 快照。
3. 无法解析 tenant、成员已停用、租户已停用或查库异常时 fail-closed，不允许回退到无 tenant 查询。
4. 跨租户资源与不存在资源统一返回 404，不泄露资源存在性。
5. 租户限制必须落在 SQL 层，不允许先取全局数据再在内存中过滤。
6. 不修改 core；在 platform/admin 层提供租户身份中间件、必填 service scope 和 scoped route 注册机制。

## 3. 租户信任链

```text
客户端请求
  -> token/session 认证
  -> 数据库实时校验 session、用户 tenant 与部署 TENANT_ID
  -> 刷新 AuthUser { tenantId, actorId, roles }
  -> 权限中间件
  -> route/service
  -> ORM/raw SQL 强制 tenant_id 条件
```

本轮采用部署绑定租户，不从 Header、域名、路径或请求体选择租户。未来如演进为单实例动态选租户，候选 tenant 仍必须经过成员关系实时校验后才能进入 scope。

## 4. 数据模型与迁移

### 4.1 需要覆盖的系统表

- 主体与权限：`sys_user`、`sys_role`、`sys_dept`、`sys_menu`、`sys_post`、`sys_tag`。
- 关联表：`sys_user_role`、`sys_role_menu`、`sys_role_dept`、`sys_user_post`、`sys_user_tag`。
- 设置与内容：`sys_dict_type`、`sys_dict_data`、`sys_config`、`sys_notice`、`sys_user_notice`。
- 身份与审计：session/通行密钥/MFA 恢复数据、`sys_login_log`、`sys_operation_log`。
- System 模块的其他表也必须通过迁移清单扫描，不能只修页面上可见的表。

### 4.2 迁移策略

1. 迁移 016 为存量表增加 `NOT NULL DEFAULT 'default'` 的 `tenant_id`。
2. 已有数据统一归入 `default`；已有多租户语义的部署必须在开放流量前先完成业务映射审核。
3. 增加 tenant-aware 索引和唯一约束，例如 `UNIQUE (tenant_id, code)`。
4. 关联表使用复合外键保证两端与关联行同 tenant。
5. 应用查询从迁移上线起强制携带 tenant 条件，不保留无 tenant 回退路径。

## 5. 模块整改矩阵

| 模块 | 必须加租户限制的路径 | 其他必修问题 |
| --- | --- | --- |
| 用户 | CRUD、批量状态/删除/重置密码、解锁/黑名单、标签、岗位、角色、数据权限 | tenant 限制必须先于部门数据范围，两者取交集 |
| 角色/菜单/部门 | CRUD、树形查询、菜单分配、自定义部门范围 | code/name 唯一性改为 tenant-aware；禁止跨 tenant 分配 |
| 岗位 | CRUD、批量删除、用户岗位关联 | 输入上限、搜索契约、关联删除约束 |
| 字典 | 类型/数据 CRUD、按 code 读取、批量删除、缓存 | 修复 `dictType/typeCode`、ID/code 混用、事务与外键 |
| 系统配置 | CRUD、by-key、public 白名单、缓存 | 安全配置 admin-only；敏感值脱敏；修复搜索与 type/group 契约 |
| 公告 | CRUD、发布/撤回、批量操作、已读状态、未读统计 | 状态机下沉 service；条件更新；关联外键 |
| 标签 | CRUD、用户绑定、按 ID/code 反查用户 | tenant 范围再与用户数据权限取交集；绑定事务化 |
| 日志/统计 | 操作日志、登录日志、Dashboard 统计、清理/导出 | 个人日志与管理日志拆分；清理 admin-only；日志不可跨 tenant |

## 6. Service 与路由机制

当前由 Composition Root 将部署绑定的 tenantId 注入全部 System Service；实时认证中间件校验 token、数据库用户与部署 tenant 一致。Service 工厂必须收到 tenantId 才能访问租户资源。

```ts
interface ValidatedTenantScope {
  readonly tenantId: string;
  readonly actorId: string;
}
```

`createCrudRoutes` 需要演进为 scoped 注册机制，让列表、详情和写操作在注册时就必须获得 tenant scope。批量和 extra routes 也必须经过同一入口，不再依赖开发者记得逐个补条件。

## 7. OpenAPI 契约

每个 Admin 非公开 API 必须在通用 security description 或端点描述中明确：

- 租户作用域由当前认证上下文决定。
- 客户端无需且不得提交资源归属 `tenantId`。
- 跨租户资源按不存在处理。
- tenant 无效或归属校验失败时的 401/403/503 契约必须统一。

OpenAPI 生成需增加共享 metadata，避免在每个 handler 中复制文案；但生成结果必须能逐端点看到租户安全说明。

## 8. Raw SQL 与 ORM

1. ORM 可表达的岗位/公告状态查询、日志分页、Dashboard count 迁回 ORM。
2. 保留 raw 的 JOIN、`NOT EXISTS`、`ON CONFLICT`、`TRUNCATE` 必须增加参数化 `tenant_id` 条件。
3. 优先向 ORM 增加结构化批量 insert/upsert、条件 update affected rows、JOIN projection 和 exists/notExists，不增加任意字符串逃生口。

## 9. 异常处理

- 未认证/session 无效：401。
- 已认证但不是 tenant 成员：403；资源级跨 tenant 访问：404。
- tenant 解析或归属数据库查询异常：503 + 稳定错误码，必须 fail-closed。
- 关联对象不存在或不同 tenant：对外统一 404。
- 唯一冲突、状态冲突与输入错误使用稳定业务错误码，不向客户端暴露 SQL 和 tenant 内部信息。

## 10. 测试与验收

每个端点至少覆盖：

1. tenant A 操作 tenant A 资源成功。
2. tenant A 查不到 tenant B 资源。
3. tenant A 不能更新、删除、批量操作或关联 tenant B 资源。
4. 缺失 tenant、伪造 tenant、停用 tenant、失效成员和解析异常全部 fail-closed。
5. 同 tenant 内仍继续受 RBAC、admin-only 与用户部门数据权限限制。
6. 缓存、日志、导出、异步任务和 raw SQL 有独立跨 tenant 回归用例。
7. 生成的 OpenAPI 不接受客户端 tenant 归属字段，并包含租户安全说明。

## 11. 实施顺序

1. 先建立 tenant/成员真实数据模型和实时校验中间件。
2. 增加 `ValidatedTenantScope` 和 scoped route/service 契约。
3. 执行分阶段数据迁移，补齐 system 全部表的 tenant 字段、索引、唯一性和外键。
4. 先改用户/角色/部门/菜单和安全配置，再改岗位/字典/公告/标签/日志。
5. 改造所有 raw SQL、缓存、日志、导出和异步路径。
6. 生成并审核 OpenAPI，按“端点 × tenant 场景”执行回归测试。
7. 只有在全量跨租户测试通过后，才允许将 `TENANT_ENABLED` 从“实验性”改为生产可用。

## 12. 当前实现状态

已完成 System 模块 20 张表的 tenant 字段、租户内唯一键及主要关系的复合外键；用户、角色、菜单、部门、岗位、字典、配置、公告、标签、认证凭据、日志和 Dashboard 查询均强制 tenant SQL 条件；缓存键与认证临时令牌已租户化；通用 CRUD OpenAPI 已声明租户契约。

后续复核又补充了以下收口：

- `tenantId` 改为 System/Boot 必填依赖，空值或超过 36 字符时拒绝启动；显式启用多租户时不允许隐式使用默认值。
- 通用认证中间件支持部署 tenant 绑定，Admin 启用的 monitor、notification、i18n、workflow、OSS、scheduler、gen、AI 与 ai-trace 入口均拒绝跨租户 JWT。
- 认证与实时身份中间件不再捕获 `next()` 的业务异常，避免将下游错误伪装为 401/503。
- 敏感配置列表只返回掩码，掩码回传表示保持原值；字典/配置全量缓存刷新使用 tenant namespace pattern。
- 公告修改、发布和撤回使用带前置状态的原子 `UPDATE ... RETURNING`；字典类型删除改为事务，用户标签分配改为单次 `batchInsert`。

需要区分两层保障：上述所有 Admin 模块已完成“入口租户绑定”；本文本轮数据库改造的范围是 System 模块。Notification/I18n/Scheduler/Gen 等独立平台模块若要在同一数据库内供多个租户共享，还必须分别增加 tenant 列、租户唯一键和逐查询条件；在该表级改造完成前，不得将多个租户部署指向同一组这些模块的表。

当前边界是“一个 Admin 部署绑定一个 TENANT_ID”，尚未提供单实例按请求动态切换租户或租户成员管理控制面。该边界必须在部署文档和 API 文档中保持明确。
