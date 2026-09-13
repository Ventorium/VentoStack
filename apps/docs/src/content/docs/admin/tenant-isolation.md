---
title: Admin 租户隔离
description: Admin System API 的租户信任边界、数据约束与异常契约
---

Admin System 的用户、角色、菜单、部门、岗位、字典、配置、公告、标签、认证凭据和日志都必须归属于租户。当前采用“部署绑定租户”模式：后端从 `TENANT_ID` 读取可信租户，不接受请求体、查询参数或 Header 传入资源归属。

## 配置

```env
TENANT_ENABLED=true
TENANT_ID=default
```

`TENANT_ID` 必须是稳定且非空的租户标识。单租户部署也使用 `default` 命名空间，SQL 不会退化为无租户条件。变更部署租户前，应确认迁移后的数据归属已完成映射。

## API 契约

- 认证成功后，JWT 中的 `tenantId`、数据库用户的 `tenant_id` 与部署 `TENANT_ID` 必须一致。
- 客户端不得提交 `tenantId`；未知字段由 strict schema 拒绝。
- 所有查询、更新、删除、批量操作和关联写入都在 SQL 层包含 `tenant_id`。
- 跨租户资源按不存在处理，避免泄露资源是否存在。
- session、账号或租户身份不匹配时认证失败；数据权限解析异常时 fail-closed。
- 用户资源在租户范围内还会继续应用部门数据权限，两者取交集。

通用 CRUD 的 OpenAPI operation description 会显示上述租户约束。自定义端点遵循同一契约，租户由认证上下文隐式确定，因此 OpenAPI 不声明客户端可填写的 tenant 字段。

## 数据库保障

迁移 `016_tenant_scope_system_tables` 为全部 `sys_*` 业务表增加非空 `tenant_id`、租户索引和租户内唯一键。用户角色、角色菜单、角色部门、用户岗位、用户标签、用户公告、Passkey、MFA 恢复码等关联使用复合外键，数据库会拒绝跨租户关联。

迁移把既有数据归入 `default`。已有多租户数据的环境必须在开放流量前完成归属核对和业务映射。

## 缓存与认证

配置、字典、用户、角色、登录限流、失败计数、密码重置和 Passkey challenge 的缓存键都包含租户 namespace。MFA、密码过期和恢复临时令牌携带 tenant claim，消费时必须与当前部署租户一致。

## 开发约束

新增或修改 Admin 后端实体时，必须使用服务端可信 tenant scope，并满足：

1. Model 与 migration 都声明 `tenant_id`。
2. Service 工厂要求 tenantId，所有 ORM 查询先加 tenant 条件。
3. raw SQL 必须参数化 tenant 条件，并在代码审查中说明 ORM 无法表达的原因。
4. 关联对象必须验证同 tenant，批量操作不得先全局查询后内存过滤。
5. 至少包含跨租户读取和写入失败的回归测试。

完整设计与整改记录见 `docs/designs/admin-system-modules-hardening.md`。
