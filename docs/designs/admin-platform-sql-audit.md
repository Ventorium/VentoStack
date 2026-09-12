# Admin / Platform SQL 使用审计

审计日期：2026-09-12。

## 结论

排除测试、迁移和种子后，`apps/admin` 与 `packages/platform` 当前还有 79 处 `db.raw()`。本次已将角色部门维护、角色级联删除、角色使用统计、部门用户查询、用户角色/岗位有效性校验及空关联删除迁移到 ORM，raw 调用由 89 处降至 79 处。

剩余调用主要分为：

- ORM 可直接替换：system 单表查询、统计、分页、普通更新和删除。
- ORM 应扩展后替换：JOIN、DISTINCT、EXISTS、upsert、affected rows、批量 returning、原子表达式更新和 `FOR UPDATE`。
- 可保留并审计：迁移、健康检查、数据库专用运维语句及少量 PostgreSQL CTE。

## 剩余分布

| 数量 | 文件 |
|---:|---|
| 12 | `workflow/src/engine/assignee.ts` |
| 10 | `system/src/module.ts` |
| 8 | `workflow/src/services/task.ts` |
| 8 | `ai-trace/src/services/trace-store.ts` |
| 6 | `notification/src/services/notification.ts` |
| 5 | `system/src/services/user.ts` |
| 5 | `system/src/services/notice.ts` |
| 4 | `workflow/src/services/definition.ts` |
| 4 | `scheduler/src/services/scheduler.ts` |
| 4 | `ai-trace/src/services/trace-queries.ts` |
| 2 | `workflow/src/services/instance.ts` |
| 2 | `workflow/src/engine/actions.ts` |
| 2 | `system/src/services/tag.ts` |
| 2 | `monitor/src/services/monitor.ts` |
| 2 | `i18n/src/services/i18n.ts` |
| 2 | `ai-trace/src/services/trace-config.ts` |
| 1 | `system/src/services/auth.ts` |

## ORM 能力路线

按复用价值排序补充：

1. 结构化条件分组与谓词 AST。
2. 类型安全 JOIN、字段别名和 DISTINCT。
3. EXISTS / NOT EXISTS。
4. `onConflictDoNothing` 和 upsert。
5. affected rows、`returningMany` 和 `forUpdate`。
6. `increment` 等安全字段表达式。

新增能力后按模块逐批替换 raw；用户请求链路中的受数据权限保护资源不得通过 raw 绕过范围条件。

## 审查规则

- 新增 raw 必须说明 ORM 无法表达的原因。
- raw 必须参数化，动态标识符只能来自受控白名单。
- 涉及租户或数据权限资源时必须有对应安全回归测试。
- migration、seed 和健康检查不纳入业务 raw 数量，但仍需接受 SQL 注入和权限审查。
