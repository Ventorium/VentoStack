# Admin 角色数据权限设计与实现评审说明

> 状态：已实现，待代码审核  
> 日期：2026-09-12  
> 范围：`apps/admin`、`packages/platform/system` 及相关文档  
> 明确约束：不修改 `packages/framework/core`

## 1. 背景

Admin 已有 RBAC 菜单和操作权限，也已经存在 `sys_role.data_scope` 与
`sys_role_dept` 表，但原有实现只完成了角色数据范围的存储，没有形成真正的数据访问控制闭环：

- 角色可以写入 `data_scope`，但用户查询不会使用该字段过滤。
- 自定义部门关联表存在，但权限加载器没有完整解析。
- “本部门及以下”只有 TODO，没有部门后代展开逻辑。
- `RowFilter` 没有被生产查询消费，并且全局注册角色规则会把不同用户、不同角色的条件混在一起。
- 列表、详情、更新、删除、导出等入口没有统一的数据范围约束。
- 前端角色页面没有数据权限配置入口。

因此，原有 `data_scope` 实际上是配置数据，不是安全控制。

本次目标是实现类似若依的数据权限能力：

1. 全部数据权限。
2. 本部门数据权限。
3. 本部门及以下数据权限。
4. 仅本人数据权限。
5. 自定义部门数据权限。

其中前四种没有部门选择项；自定义范围允许多选部门，选择哪些部门即可查看哪些部门的数据。

## 2. 设计目标与非目标

### 2.1 目标

- 数据范围由角色统一配置，业务请求不能相信前端传入的部门范围。
- 一个用户拥有多个角色时，按权限并集合并，而不是错误地使用交集。
- 用户管理的读写入口必须全部受同一规则保护，避免只过滤列表却遗漏详情或写操作。
- 数据库或权限解析异常时拒绝访问，不能退化为全部数据。
- 权限变更后立即生效，不依赖旧 JWT 中可能过期的数据范围。
- 尽量在 system 模块的组合根和统一用户路由接入，减少业务人员逐个 Handler 手写条件。
- 使用 ORM 表达 ORM 已支持的查询，并审计剩余 raw SQL。
- 不修改 core，不把具体业务表结构反向耦合进框架核心。

### 2.2 非目标

- 本次不实现数据库级、对所有表自动生效的 SQL AST 重写器。
- 本次不让框架猜测任意业务表中的部门字段或创建人字段。
- 本次不修改 ORM 或 core 的公共契约。
- 本次落地保护的业务资源是系统用户；公告、工作流、通知等其他资源需要后续按资源语义接入。

## 3. 为什么没有照搬全局 SQL 拦截器

若依通常通过注解、线程上下文和 SQL 插件在查询时追加部门或创建人条件。本项目采用函数式组合、显式依赖注入和 Bun 异步运行模型，直接照搬会产生以下问题：

1. ORM 与 raw SQL 并存，全局拦截 ORM 并不能保证 raw SQL 不绕过。
2. 不同表的归属字段并不统一，有的使用 `dept_id`，有的使用 `created_by`，有的需要关联拥有者表。
3. 自动猜测别名和字段可能生成错误 SQL，最危险的结果不是报错，而是错误放大数据范围。
4. 隐式异步上下文会削弱当前项目“显式依赖、可测试、无运行时魔法”的架构原则。
5. 把业务数据范围逻辑放入 core 会破坏模块分层，也违反本次“不动 core”的要求。

因此本次采用“两段式”设计：

```text
认证用户
   │
   ▼
DataScopeResolver（统一解析用户当前有效范围）
   │
   ├── 列表/导出：将 ResolvedDataScope 传给 UserService 构造 ORM 条件
   │
   ├── 详情/删除/重置密码/状态变更：统一 canAccessUser 检查
   │
   └── 创建/变更部门：统一 canAssignDepartment 检查
```

解析策略集中在 platform/system，资源查询仍由拥有该资源的 Service 表达。该方案没有全局 SQL 魔法，但比当前 ORM 能力下的伪全局拦截更容易审计，也不会默默遗漏 raw SQL。

## 4. 权限模型

### 4.1 固定编码

| 值 | 常量 | 含义 |
|---:|---|---|
| 1 | `ALL` | 全部数据 |
| 2 | `DEPARTMENT` | 当前用户所在部门 |
| 3 | `DEPARTMENT_AND_DESCENDANTS` | 当前部门及所有有效后代部门 |
| 4 | `SELF` | 当前用户本人 |
| 5 | `CUSTOM_DEPARTMENTS` | 角色绑定的多个有效部门 |

新角色默认使用 `SELF`，遵循最小权限原则。

### 4.2 多角色合并

多角色使用并集，规则如下：

- 任意有效角色是 `ALL`，最终结果为全部数据。
- 部门、本部门及以下、自定义部门产生的部门 ID 去重后合并。
- 任意角色是 `SELF`，最终范围额外包含本人。
- 部门范围与本人范围在资源查询中使用 `OR`，例如：

```sql
WHERE (dept_id IN (...) OR id = current_user_id)
```

不能简单按数字大小比较范围，因为自定义部门、本人和部门范围之间不是线性大小关系。

### 4.3 超级管理员

- 数据库当前有效角色代码包含 `admin` 时解析为全部数据，JWT 中的角色列表不作为数据权限依据。
- `admin` 角色自身不能被修改为非全部范围。
- 这是现有 RBAC 超管语义的延续，不额外引入新的超级管理员标志。

## 5. 数据权限解析过程

`createDataScopeResolver(db)` 每次请求按以下顺序解析：

1. 重新查询当前用户及其 `dept_id`。
2. 查询 `sys_user_role` 获得当前角色关联。
3. 只加载状态正常的角色及其 `code`、`data_scope`。
4. 数据库当前有效角色包含 `admin` 时返回全部数据。
5. 对自定义角色查询 `sys_role_dept`。
6. 如果存在“本部门及以下”，加载有效部门并在内存中展开后代。
7. 通过纯函数 `mergeDataScopes` 合并为统一结果。

最终结构为：

```typescript
interface ResolvedDataScope {
  all: boolean;
  departmentIds: string[];
  self: boolean;
  userId: string;
}
```

这里刻意没有直接信任 JWT 携带的数据范围或 `admin` 身份。JWT 只用于确认用户 ID，角色、部门、自定义范围和超管身份均以数据库当前状态为准，因此撤销 admin 或修改角色后无需等待旧 Token 过期。现有 RBAC 中间件仍可能在旧 Token 生命周期内放行功能权限，但数据范围解析和高风险用户写操作不会因此获得全部数据权限。

## 6. 用户资源的强制接入点

`createUserRoutes` 现在必须接收 `DataScopeResolver`，调用方不能省略。system 组合根只创建一个解析器并注入统一用户路由。

| 操作 | 控制方式 | 越权行为 |
|---|---|---|
| 用户列表 | Service ORM 查询追加部门/本人组合条件 | 返回范围内结果 |
| 用户导出 | 与列表使用相同过滤逻辑 | 只导出范围内结果 |
| 用户详情 | `canAccessUser` | 返回 404 |
| 创建用户 | `canAssignDepartment` | 返回 403 |
| 更新用户 | 检查目标用户，并检查新部门 | 目标越权返回 404，部门越权返回 403 |
| 删除用户 | `canAccessUser` | 返回 404 |
| 重置密码 | `canAccessUser` | 返回 404 |
| 修改状态 | `canMutateUser` | 返回 404 |
| 解锁、黑名单 | `canMutateUser` | 返回 404 |
| 批量删除、批量状态、批量重置密码 | 逐个执行 `canMutateUser` | 越权目标计入 skipped |
| 查询用户标签 | `canAccessUser` | 返回 404 |
| 分配用户标签 | `canMutateUser` | 返回 404 |

读写目标越权使用 404，是为了避免向无权限调用者泄露用户是否存在。创建或选择非法目标部门使用 403，因为此时调用者已经明确提交了部门。`canMutateUser` 还会落库确认目标是否拥有有效 `admin` 角色；除数据库当前 admin 外，其他用户即使与目标同部门也不能修改 admin 用户。

列表与导出采用 fail-closed 占位条件。如果解析结果既没有全部权限、部门范围，也不包含本人，会追加一个不可能命中的用户 ID 条件，确保返回空集合，而不是因为“没有条件”变成全表查询。

## 7. 角色数据范围配置

### 7.1 API

```http
GET /api/system/roles/:id/data-scope
PUT /api/system/roles/:id/data-scope
```

自定义范围请求示例：

```json
{
  "scope": 5,
  "deptIds": ["department-a", "department-b"]
}
```

其他范围只发送 `scope`，不能携带部门列表。

### 7.2 服务端校验

- `scope` 必须是 1—5 的整数枚举值。
- 自定义范围至少一个部门，最多 500 个。
- 部门 ID 必须是非空且长度不超过 36 的字符串。
- 部门 ID 去重后处理。
- 所选部门必须存在且处于启用状态。
- 非自定义范围拒绝任何部门 ID，避免历史关联含义不清。
- 保存范围前清理旧 `sys_role_dept`，更新角色和关联部门在同一事务完成。
- 非全部权限的操作者不能授予 `ALL`。
- 非全部权限的操作者只能在自己的部门范围内选择自定义部门。
- `admin` 角色只能保持 `ALL`。

授予者范围同时是 `RoleService.assignDataScope` 的必填参数，服务层会重复执行越权校验。这样未来 CLI 或其他模块直接调用服务时，无法因绕过当前 HTTP 路由而省略授权边界。

### 7.3 前端交互

角色管理页增加独立“数据权限”操作：

- 五种范围使用单选项。
- 只有自定义范围显示部门树和多选框。
- 打开弹窗时并行加载角色当前范围和部门树。
- 自定义范围未选部门时在提交前提示。
- `admin` 的数据权限操作禁用。

前端校验只改善体验，所有安全约束均在服务端重复执行。

## 8. 异常与边界处理

### 8.1 权限解析异常

数据库读取或解析失败统一包装为：

```text
DataScopeResolutionError extends VentoStackError
code: 503
errorCode: DATA_SCOPE_RESOLUTION_FAILED
message: 数据权限暂时不可用
```

保留原始错误作为 `cause`，便于内部日志和排障；对外信息不包含 SQL、连接串或堆栈。异常不会被转换为空条件或全部权限。

### 8.2 特殊数据状态

| 情况 | 处理 |
|---|---|
| 当前用户记录不存在 | 无数据权限 |
| 用户没有角色 | 无数据权限 |
| 角色已停用 | 忽略该角色 |
| 用户没有部门，但角色要求部门范围 | 该角色贡献空范围 |
| 自定义部门为空或关联失效 | 该角色贡献空范围 |
| 部门树存在孤儿节点 | 只从当前部门真实可达的后代展开 |
| 多角色重复部门 | Set 去重 |
| 非自定义范围残留旧关联 | 保存时统一清理 |

### 8.3 控制面防提权

角色数据范围配置本身属于控制面操作。除了 `system:role:update` RBAC 权限外，还限制操作者不能授予明确超出自身范围的全部数据或自定义部门。admin 判断和高风险目标角色判断均重新查询数据库，不信任 JWT 中可能过期的角色列表。

“本部门”和“本部门及以下”的实际范围取决于角色最终被分配给哪个用户，因此它们不能仅根据当前操作者部门静态判断。后续如需更严格的角色委派模型，应增加独立的“可委派角色/组织范围”策略，而不是混入数据查询范围。

## 9. 数据库迁移与兼容性

新增迁移 `014_normalize_data_scope`：

1. 使用单条 `CASE` 更新原子交换旧数据中 2、3 的语义，使其与最终约定一致；不使用临时枚举值，因此不会与线上脏数据碰撞。
2. 将空 `data_scope` 迁移为 4，即仅本人。
3. 新角色默认值由服务层改为 4。

迁移的 down 会交换 2、3，但不会把 4 还原为 null，因为无法区分原始 null 与原本就是 4 的记录。该行为是有意的，回滚后仍保持更安全的最小权限默认值。

上线前应先备份 `sys_role` 和 `sys_role_dept`，并在预发布环境核对既有角色的范围含义。

## 10. RowFilter 处理

原权限加载器中的数据范围规则函数及其 `RowFilter` 依赖已经删除。原因是原实现把所有角色规则加载到共享 `RowFilter`，并且过滤器使用 AND 组合，这会造成：

- 不同角色的范围互相收窄，而正确语义应是并集。
- 规则缺少当前用户和当前有效角色的请求级上下文。
- 自定义部门与部门后代没有真正展开。
- 生产用户查询没有消费这些规则，容易形成“看起来有权限控制”的假象。

RBAC 菜单权限加载仍由 `PermissionLoader` 负责；数据范围改由请求级 `DataScopeResolver` 负责。删除死代码可避免未来误用与 2、3 范围语义再次交换。

## 11. ORM 与 raw SQL 审计

排除测试、迁移和种子后，本次审计开始时 `apps/admin` 与 `packages/platform` 有 89 处 `db.raw()`，完成后为 79 处。

本次改为 ORM 的内容包括：

- 角色删除时清理角色菜单、用户角色、自定义部门关联。
- 角色自定义部门关联的清理和批量写入。
- 批量删除角色前的角色使用统计。
- 部门负责人校验与负责人名称批量查询。
- 用户岗位和角色 ID 有效性校验。
- 用户岗位、用户角色空列表清理。

剩余 raw SQL 分为三类：

1. 当前 ORM 已能表达，可继续逐步替换。
2. 需要 ORM 先增加 JOIN、DISTINCT、EXISTS、upsert、affected rows、批量 returning、表达式更新或 `FOR UPDATE`。
3. 迁移、健康检查、数据库专用运维语句等可保留但必须审计。

完整分布见 [Admin / Platform SQL 使用审计](./admin-platform-sql-audit.md)。

## 12. 文件变更说明

### 后端模型与服务

- `packages/platform/system/src/models/role.ts`：增加 `RoleDeptModel`。
- `packages/platform/system/src/services/role.ts`：范围枚举、服务层授予边界校验、事务保存与读取。
- `packages/platform/system/src/services/data-scope.ts`：请求级解析器和多角色合并。
- `packages/platform/system/src/services/user.ts`：列表和导出的 ORM 范围条件。
- `packages/platform/system/src/services/dept.ts`：可表达 raw SQL 改为 ORM。
- `packages/platform/system/src/services/permission-loader.ts`：删除全局 RowFilter 数据范围死代码及依赖。

### 路由与装配

- `packages/platform/system/src/routes/user.ts`：标准用户 CRUD 与导出入口强制检查。
- `packages/platform/system/src/module.ts`：创建解析器、保护扩展用户端点、增加角色范围 API 和控制面校验。
- `packages/platform/system/src/routes/crud.ts`：Schema enum 类型允许字符串或数字。

### 数据库与前端

- `apps/admin/api/src/database/migrations/014_normalize_data_scope.ts`：兼容迁移。
- `apps/admin/api/src/database/migrations.ts`：注册迁移。
- `apps/admin/web/src/pages/app/system/roles/index.tsx`：范围配置界面。
- `apps/admin/web/src/components/ActionColumn/index.tsx`：操作项支持禁用状态。

### 测试和文档

- `packages/platform/system/src/__tests__/data-scope.test.ts`：合并和异常安全测试。
- `role.test.ts`、`user.test.ts`、`permission-loader.test.ts`、安全测试：补充回归覆盖。
- `apps/docs/src/content/docs/platform/system/role.md`：面向使用者的角色权限文档。
- `docs/designs/admin-platform-sql-audit.md`：raw SQL 审计。

## 13. 测试与验证

已执行：

- `bun test packages/platform/system/src`：236 通过，0 失败。
- 角色页面相关测试：18 通过，0 失败。
- 数据范围测试覆盖异常 503、旧 JWT admin 撤权、非 admin 禁止修改 admin，以及真实 ORM 括号结构。
- 相关文件 Biome check：通过。
- `git diff --check`：通过。

全仓 `bun run typecheck` 当前被既有问题阻塞：`@ventostack/ai` 的生成声明缺少
`addAgentWelcomeMessage`、`agentModelsArray`、`dropAiToolLog` 三个导出。该错误发生在本次修改范围之外。

Admin API 本地启动还受到 PostgreSQL 连接关闭影响，因此无法运行依赖在线 OpenAPI 的 o2t 生成。前端 `schema.ts` 保持未修改；数据库可用后应启动 API 并执行项目既有类型生成流程。

## 14. 已知限制和后续建议

### 14.1 当前限制

- 已完整接入的是用户管理资源，不代表所有 platform 业务表已自动受数据范围保护。
- 数据范围当前每次请求读取数据库，没有缓存；正确性优先，但高流量下需要评估查询成本。
- 部门后代通过加载有效部门并在内存展开，适合当前组织规模；超大组织应考虑闭包表、物化路径或递归 CTE。
- 前端生成 API 类型需要在数据库和 Admin API 可用后重新生成。
- 用户扩展端点目前仍位于 system 组合根，而标准 CRUD 位于 `createUserRoutes`；虽然两组均已接入解析器，后续应合并为单一 scoped 路由模块，从结构上降低新增端点遗漏风险。

### 14.2 推荐后续演进

1. 在 platform 层定义显式的数据资源注册表，例如声明资源归属字段是 `dept_id`、`created_by` 或自定义关联查询。
2. 提供统一的 `createScopedCrudRoutes` 或 scoped repository，使新业务资源在注册时必须提供数据归属策略。
3. 对受保护资源禁止无审计 raw SQL；必要 raw 查询必须显式接收 `ResolvedDataScope`。
4. 为 ORM 增加结构化条件组、JOIN、EXISTS、upsert、affected rows、`returningMany` 和 `forUpdate`。
5. 增加请求级短缓存，并在角色、用户部门和角色部门关联变更时精确失效。
6. 增加真实 PostgreSQL 集成测试，覆盖迁移、事务、部门树和最终生成 SQL。
7. 增加角色委派策略，区分“可以编辑角色”和“可以授予哪些组织范围”。

### 14.3 已确认技术债

以下项目经交叉审阅确认不阻塞本次合并，但应与 scoped CRUD / scoped 路由机制一并处理。

#### TD-DS-01：清理组合根残留 RowFilter 依赖（已完成）

完成情况：

- system 模块已删除 `RowFilter` import 和依赖字段。
- boot 已停止向 system 透传 RowFilter。
- admin composition root 已停止创建和装配无消费者的 RowFilter。
- auth 包的通用 RowFilter 能力保持不变。

影响：不会造成运行时越权，但会让维护者误以为 system 数据权限仍依赖 RowFilter，并保留无意义的装配契约。

处理建议：沿调用链一次性删除 system 模块的 import、依赖字段、boot 透传和 admin app 装配参数。只移除 system 的无效依赖，不影响 auth 包中仍可能独立使用的 RowFilter API。

验收标准：

- system 模块源码不再引用 `RowFilter`。
- boot 创建 system 模块时不再传入 `rowFilter`。
- admin composition root 不再为 system 数据权限装配 RowFilter。
- RBAC、数据权限及启动测试保持通过。

#### TD-DS-02：批量用户操作的数据权限查询放大（已完成）

完成情况：新增 `filterMutableUserIds`，一次解析操作者范围并通过集合查询加载目标用户和 admin 角色，查询数量保持固定数量级；批量删除、状态修改和密码重置均已接入。

影响：正确性和 fail-closed 行为不受影响，但大批量操作可能产生明显延迟和数据库压力。

处理建议：

1. 在请求开始时只解析一次 actor 范围和数据库 admin 状态。
2. 增加批量接口，例如 `filterMutableUserIds(actor, targetIds)`。
3. 使用集合查询一次加载所有目标用户、部门、用户角色和角色代码。
4. 返回允许与拒绝 ID 集合，批量业务循环只消费解析结果。
5. 如增加请求级 memo，生命周期必须限制在单次请求，不能跨请求缓存授权结论。

验收标准：

- 数据库查询数量不随目标数量线性增长，100 个 ID 仍保持固定数量级查询。
- 非 admin 无法修改 admin 用户的回归测试保持通过。
- 越权目标继续计入 `skipped`，权限查询失败继续整体 fail-closed。
- 权限变更不会被跨请求缓存延迟。

#### TD-DS-03：统一 scoped 用户路由与资源注册

现状：标准用户 CRUD 位于 `createUserRoutes`，解锁、黑名单、批量操作和用户标签等扩展端点仍位于 system `module.ts`。当前均已显式接入数据权限，但新增扩展端点时仍可能忘记检查。

处理建议：将扩展用户端点迁入统一的 scoped 用户路由模块，并在路由注册 API 中强制声明以下访问类型之一：

- `read-target`：允许读取目标资源。
- `mutate-target`：允许修改目标资源，并执行 admin 目标保护。
- `assign-department`：允许向目标部门创建或迁移资源。
- `list-scope`：必须向查询服务传递解析后的范围。
- `self-service`：只能作用于当前身份，不接受外部目标用户 ID。

未声明访问类型的用户资源路由应无法通过类型检查或注册阶段校验。

验收标准：

- `module.ts` 不再直接注册 `/api/system/users/**` 管理端点。
- 新增用户管理端点时必须显式选择 scoped 访问类型。
- 有自动化测试枚举所有用户管理路由并确认其范围策略。
- raw SQL 或自定义查询不能绕过已解析的数据范围。

## 15. 审核重点清单

建议审核者重点确认：

- [ ] 2、3 的历史编码交换是否符合线上现有数据含义。
- [ ] 多角色应采用并集的业务规则是否确认。
- [ ] `admin` 角色代码作为超管判断是否是项目稳定契约。
- [ ] 越权详情和写操作返回 404 的策略是否符合 API 规范。
- [ ] 非全部权限操作者的角色范围授予规则是否足够严格。
- [ ] 用户无部门时，本部门范围返回空数据是否符合业务预期。
- [ ] 解析失败返回 503 并拒绝访问是否符合可用性要求。
- [ ] 用户列表和导出的组合条件是否保持部门与本人之间的 OR 语义。
- [ ] ORM 生成 SQL 是否保留 `(dept_id IN (...) OR id = ...)` 括号结构。
- [ ] 标准 CRUD 与扩展、批量用户写入口是否均经过目标资源检查。
- [ ] 迁移回滚不恢复 null 的安全取舍是否接受。
- [ ] 当前只完整保护用户资源的边界是否被清楚理解。
- [ ] 后续业务资源是否应强制使用 scoped CRUD/repository 注册机制。
- [ ] 剩余 79 处 raw SQL 的分类和 ORM 演进顺序是否合理。

## 16. 审核结论记录模板

```text
审核人：
审核日期：

结论：通过 / 有条件通过 / 不通过

必须修改：
1.

建议修改：
1.

迁移确认：
- 线上旧 data_scope=2 的实际含义：
- 线上旧 data_scope=3 的实际含义：
- 是否允许执行 014 迁移：是 / 否

安全确认：
- 多角色并集：接受 / 不接受
- 异常 fail-closed：接受 / 不接受
- 当前资源覆盖范围：接受 / 需扩大
```

## 17. 首轮交叉审阅后的修正

首轮交叉审阅结论为“有条件通过”。本轮已逐项处理：

| 审阅项 | 处理结果 |
|---|---|
| 扩展用户端点绕过数据权限 | 已为解锁、黑名单、三个批量端点和用户标签读写补齐检查 |
| HTTP 层没有 503 契约 | `DataScopeResolutionError` 已继承 `VentoStackError`，并让 create/export 重新抛出该异常 |
| PermissionLoader 遗留相反语义死代码 | 已删除函数及 `RowFilter` 依赖 |
| admin 判断信任旧 JWT | 已改为查询数据库当前有效角色，并增加撤权回归测试 |
| ORM OR 分组依赖缺少测试 | 已使用真实 ORM executor 断言 SQL 括号结构 |
| 迁移临时值可能碰撞脏数据 | 已改为单条 `CASE` 原子交换，不再使用临时值 |
| Service 可绕过控制面授权 | `assignDataScope` 改为强制接收授予者范围并重复校验 |
| 同部门用户可修改 admin | 新增 `canMutateUser`，非数据库当前 admin 一律不能修改有效 admin 用户 |

仍保留的结构性改进是：把 system 组合根中的扩展用户端点迁入统一 scoped 用户路由模块。当前端点已全部显式接入检查，但集中注册能进一步减少未来新增端点遗漏的概率。
