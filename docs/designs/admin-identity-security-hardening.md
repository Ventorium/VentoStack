# Admin 用户体系安全加固设计与实现记录

## 1. 背景

在角色数据权限功能完成后，对 Admin 的用户、角色、部门、菜单与认证链路进行了第二轮交叉审查。数据权限已经能够限制“操作者可以看到和修改哪些用户”，但用户体系还存在另一类更高层风险：功能权限只能说明操作者拥有某个入口权限，不能自动证明其可以授予任意角色、修改授权控制面或改变组织结构。

本轮目标是补齐以下闭环，同时继续遵守“不修改 framework/core”的约束：

1. 用户数据范围与角色授予范围同时成立。
2. 超级管理员身份以数据库实时状态为准，不能长期信任 JWT 快照。
3. 撤权、停用、拉黑和强制下线对旧 access token 立即生效。
4. 角色、菜单、部门等授权控制面默认采用更严格的管理边界。
5. 树形结构和关联关系在 service 与数据库两层保持一致。
6. 能由 ORM 表达的写入不继续使用 raw SQL。

## 2. 审查发现

| 编号 | 级别 | 问题 | 失败模式 |
|---|---|---|---|
| ID-01 | P0 | 用户新增/编辑可传任意 `roleIds` | 非超管给自己或下属分配 admin，重新登录后完全提权 |
| ID-02 | P0 | 角色 CRUD 没有控制面边界 | 可改/停用/删除 admin，或给角色追加自身没有的菜单权限 |
| ID-03 | P1 | 功能权限信任 JWT 角色快照 | 撤销 admin、停用用户后，旧 token 在过期前继续访问 |
| ID-04 | P1 | 角色 code 可修改 | 内存 RBAC 保留旧 code，旧 token 继续命中旧权限 |
| ID-05 | P1 | 用户名无唯一约束 | 同名用户导致登录主体和审计主体不确定 |
| ID-06 | P1 | 部门/菜单允许循环父子关系 | 树序列化递归或数据范围 BFS 无限循环，形成 DoS |
| ID-07 | P1 | 菜单删除只处理一层子节点且非事务 | 孤儿菜单、残留角色关联、部分删除 |
| ID-08 | P1 | 角色菜单替换先删后插但非事务 | 插入失败后角色权限被清空；无目标存在性校验 |
| ID-09 | P2 | 用户主体与角色/岗位分步写入 | 任一步失败后留下半成品数据 |
| ID-10 | P2 | 新用户角色/岗位 CTE 语义错误 | 新用户没有旧关联，DELETE RETURNING 为空导致 INSERT 不执行 |
| ID-11 | P2 | 关系表缺少外键 | 孤儿用户角色、角色菜单、角色部门和树节点可长期存在 |
| ID-12 | P2 | 数组和通用列表输入边界不完整 | 超长数组、非法 ID 和未知查询字段进入 service |
| ID-13 | P2 | 部门创建声明 status 但固定写 1 | OpenAPI 契约与落库行为不一致 |
| ID-14 | P2 | 批量用户操作逐 ID 解析授权 | 100 个目标产生数百次串行查询 |
| ID-15 | P3 | system/boot/admin 残留 RowFilter 装配 | 无消费者但造成错误架构暗示和无效依赖 |

## 3. 核心安全不变量

### 3.1 身份与会话

- JWT 只负责证明令牌经过签名，不作为角色当前状态的最终事实来源。
- 每个 system 管理请求必须存在有效的服务端 session。
- 每个请求从数据库读取账号状态、黑名单状态和启用角色，并覆盖 JWT 中的角色快照。
- 用户停用、拉黑、删除、重置密码或角色变更后调用 `forceLogout`，服务端 session 删除后旧 access token 在下一请求立即得到 401。

### 3.2 角色授予

- admin 身份必须通过 `sys_user_role + sys_role(status=1, code=admin)` 实时确认。
- 非 admin 只能向下传递自己当前实际持有的启用角色。
- 修改自己的角色默认拒绝，避免自提权和误锁定。
- service 在存在 `roleIds` 时强制要求操作者并再次执行授予校验；CLI 或未来新路由不能绕过。

### 3.3 授权控制面

- 角色、菜单、部门的创建、更新、删除，以及角色菜单/数据范围分配，除原 RBAC 权限外，还要求数据库实时 admin。
- 角色 code 不可修改。
- admin 角色不可停用、不可删除，且数据范围必须保持 ALL。
- 已分配给用户的角色不能删除。

当前选择 admin-only，而不是给角色/菜单/部门再设计一套复杂层级委派，是有意的安全收敛：在委派模型尚未定义前，不让普通功能权限隐式等价于授权控制面权限。

## 4. 实现方案

### 4.1 IdentityGovernanceService

新增 `services/identity-governance.ts`，集中提供：

- `isActiveAdmin(userId)`：数据库实时确认 admin。
- `assertActiveAdmin(user)`：控制面 fail-closed 守卫。
- `assertCanAssignRoles(user, roleIds)`：角色向下传递边界。
- `adminOnlyMiddleware`：供通用 CRUD 和扩展写路由统一挂载。

拒绝授权时抛出 `IdentityGovernanceError`，HTTP 状态为 403，业务错误码为 `IDENTITY_GRANT_FORBIDDEN`。

### 4.2 实时认证中间件

新增 `middlewares/live-auth.ts`，包装原 JWT 中间件：

```text
JWT 验签
  -> sid 对应服务端 Session 是否存在且属于当前用户
  -> 用户是否存在、启用且未拉黑
  -> 查询当前启用角色并覆盖 ctx.user.roles
  -> 功能权限中间件
```

该设计没有修改 core，也没有改变 auth 包的通用 JWT 验签职责；实时主体校验属于 system 管理面的安全策略。

### 4.3 用户写入事务和 ORM 化

原 `assignUserRoles` / `assignUserPosts` 使用 raw CTE：

```sql
WITH d AS (DELETE ... RETURNING ...)
INSERT ... WHERE EXISTS (SELECT 1 FROM d)
```

新用户没有旧关联时 `d` 为空，INSERT 被跳过。现改为同一 ORM 事务内：

1. 写入/更新用户主体。
2. 删除旧关系。
3. 使用 ORM `batchInsert` 插入去重后的关系。
4. 任一步失败则整体回滚。

这同时删除了两处本可由 ORM 表达的 raw SQL。

### 4.4 角色与菜单一致性

- `assignMenus` 校验角色存在、菜单均存在且启用、ID 格式、去重和 500 上限。
- 删除旧菜单关系和批量插入新关系放入同一事务。
- 菜单删除改为“存在子菜单则拒绝”；叶子菜单及其角色关联在同一事务删除。
- 角色菜单、数据范围和角色状态变更后刷新 RBAC；受影响用户 session 同时失效。

### 4.5 部门和菜单树

创建/移动节点时校验：

- 父节点存在且启用。
- 不能以自己为父节点。
- 不能移动到自己的后代下。
- 遍历过程使用 visited 集合识别历史循环脏数据。

数据范围后代展开也加入 visited 集合；发现循环时抛出 `DataScopeResolutionError` 并返回 503，不放开数据。

部门删除前检查子部门、用户和角色自定义数据范围引用。部门创建的 status 现在按输入落库。

### 4.6 批量授权解析

新增 `filterMutableUserIds(actor, targetIds)`：

1. 操作者数据范围和 admin 状态各解析一次。
2. 一次集合查询加载全部目标用户。
3. 一次集合查询加载目标用户角色。
4. 一次集合查询识别 admin 目标。
5. 返回允许修改的 ID 集合。

查询数量保持固定数量级，不再随最多 100 个目标线性放大。任一授权查询异常时整体 fail-closed。

### 4.7 输入边界

- 用户角色/岗位最大 100，元素必须为 UUID。
- 角色菜单和自定义部门最大 500，元素必须为 UUID。
- 批量 ID 最少 1、最大 100，元素必须为 UUID。
- 状态字段使用 `[0, 1]` 枚举。
- 角色、菜单、部门的排序字段限制为 `0—9999`，避免无界整数进入控制面数据。
- 通用 CRUD 列表恢复 strict 校验，并通过 `listQuery` 显式声明允许的筛选字段。
- 页码最小 1，pageSize 为 1—100。

## 5. 数据库迁移 015

迁移 `015_harden_identity_integrity` 完成两类约束。

### 5.1 用户名唯一性

使用 PostgreSQL 部分唯一索引：

```sql
CREATE UNIQUE INDEX uq_sys_user_active_username
ON sys_user (lower(username))
WHERE deleted_at IS NULL;
```

因此用户名大小写不敏感；软删除后可以复用。迁移发现重复活跃用户名时主动失败，不自动重命名账号。

### 5.2 外键

为用户部门、部门父子/负责人、菜单父子、用户角色、角色菜单、角色部门、用户岗位补齐 12 个外键，并明确 CASCADE、RESTRICT 或 SET NULL。

迁移执行前会扫描全部孤儿关系；发现脏数据时主动失败，不静默删除业务数据。约束不是 `NOT VALID`，上线成功即代表历史数据和新写入均受约束。

### 5.3 上线前检查

生产执行迁移前必须备份，并先运行等价检查：

- `lower(username)` 是否存在重复活跃账号。
- 所有关系表是否存在孤儿记录。
- 部门和菜单是否存在自环或多节点环。

前两类由迁移强制阻断；树环由 service 运行时拒绝，但建议上线前主动清理。

## 6. RowFilter 清理

数据范围已由请求级 `DataScopeResolver` 负责，system 模块没有 RowFilter 消费者。本轮删除：

- `SystemModuleDeps.rowFilter`。
- boot 的 `PlatformConfig.rowFilter` 和 system 透传。
- admin composition root 的 RowFilter 创建与装配。

auth 包本身的通用 RowFilter API 保留，不修改 core。

## 7. 兼容性与行为变化

- 现有 access token 必须带 `sid` 且对应 session 存在；历史无 sid token 会返回 401，需要重新登录。
- 非 admin 不再能修改角色、菜单和部门，即使其旧角色拥有相应 CRUD 权限。
- 非 admin 只能分配自己持有的启用角色，且不能修改自己的角色。
- 角色 code 不再允许更新。
- 有成员的角色、有子节点的菜单/部门、有关联用户或数据范围的部门不能删除。
- 用户名按大小写不敏感唯一。
- 通用 CRUD 列表拒绝未声明的查询参数。

这些变化属于安全收紧，不提供兼容性降级开关。

## 8. 测试与验证范围

新增或加强的回归测试覆盖：

- JWT 残留 admin 但数据库已撤销时拒绝。
- 非 admin 不能授予未持有角色。
- service 无操作者时拒绝角色分配。
- admin 角色 code、状态和删除保护。
- forceLogout、停用账号对旧 access token 立即生效。
- 部门/菜单后代移动和历史循环检测。
- 菜单叶子删除与有子菜单拒绝。
- 用户角色 ORM delete + batchInsert 的真实调用参数。
- 批量用户授权固定数量集合查询并排除 admin。
- 迁移唯一索引、12 个外键、脏数据阻断和 down。

最终验证命令与结果记录在本文末尾，合并审核时应以最新一次输出为准。

## 9. 仍需关注的运行约束

- 实时身份校验会为每个 system 请求增加 session、用户和角色查询；这是撤权即时生效的正确性成本。后续若优化，只能使用短 TTL、版本化且可精确失效的请求缓存。
- 迁移添加外键可能锁表，应在维护窗口执行并评估表规模。
- 当前 admin-only 控制面是安全基线；如果未来需要部门管理员维护组织或角色，必须先设计显式委派模型，不能简单移除守卫。

## 10. 验证记录

2026-09-12 完成最终回归：

```text
bun test packages/platform/system/src \
  apps/admin/api/src/database/migrations/015_harden_identity_integrity.test.ts

253 pass
0 fail
436 expect() calls
24 test files
```

同时执行 `git diff --check`，未发现空白错误。仓库级 `bun run typecheck` 仍被 AI 包已有的 dist 导出错误阻断：`addAgentWelcomeMessage`、`agentModelsArray`、`dropAiToolLog`；输出中没有本轮修改文件产生的类型错误，因此不能把仓库级类型检查记录为通过。

本轮没有修改 framework/core。用户角色和岗位关联的两处可由 ORM 表达的 raw CTE 已删除；迁移、复杂统计和 ORM 尚不支持的 SQL 继续保留 raw，并要求参数化和单独审计。

第二轮交叉审阅通过后，又补齐了角色、菜单、部门 create/update 的 `status: [0, 1]` 校验和 `sort: 0—9999` 边界，并删除无消费者的 `createMockRowFilter` 测试 helper。部门批量删除的子节点计数仍属于已审计的参数化 raw SQL 渐进项，不影响本轮安全闭环。
