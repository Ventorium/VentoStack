---
order: 4
title: 角色与权限
description: '角色与权限管理模块提供角色 CRUD、菜单权限分配、数据范围控制及权限加载器，实现从数据库到 RBAC 引擎的完整权限链路。'
---

## 概述

角色与权限管理基于 `@ventostack/auth` 的 RBAC 引擎，在平台层提供面向业务的角色管理、菜单权限分配和数据范围控制。

角色、菜单权限和数据权限属于授权控制面。当前安全基线要求操作者除具备对应 RBAC 权限外，还必须是数据库中当前有效的 admin。角色 code 创建后不可修改；admin 角色不可停用或删除，数据范围必须保持全部数据；已有成员的角色不能删除。菜单和数据权限替换均在事务中完成，并使相关用户会话失效。

## 角色 CRUD

### 创建角色

```typescript
POST /api/system/roles
{
  "name": "editor",
  "label": "编辑人员",
  "sort": 2,
  "dataScope": "dept_custom",   // 数据范围
  "status": 0,
  "remark": "内容编辑角色"
}
```

### 查询角色

```typescript
GET /api/system/roles?page=1&pageSize=10&name=editor

// 响应
{
  "total": 10,
  "rows": [
    {
      "id": "role-002",
      "name": "editor",
      "label": "编辑人员",
      "sort": 2,
      "dataScope": "dept_custom",
      "status": 0,
      "menuIds": ["menu-001", "menu-003"],
      "deptIds": ["dept-001", "dept-002"],   // dataScope=custom 时的部门列表
      "userCount": 15,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 更新角色

```typescript
PUT /api/system/roles/{id}
{
  "label": "高级编辑",
  "sort": 1,
  "dataScope": "dept_and_sub",
  "menuIds": ["menu-001", "menu-003", "menu-005"],
  "deptIds": []
}
```

更新角色后自动清除所有拥有该角色的用户的权限缓存。

### 删除角色

```typescript
DELETE /api/system/roles/{id}

// 前置检查：
// 1. 角色下是否存在用户 → 存在则拒绝删除
// 2. 角色是否为系统内置角色 → 内置角色不可删除
```

## 菜单权限分配

角色通过关联菜单实现功能权限控制。每个菜单项对应一个功能入口，菜单的 `permission` 字段用于后端权限校验。

```typescript
// 分配菜单权限
PUT /api/system/roles/{id}/menus
{
  "menuIds": [
    "menu-system",          // 系统管理目录
    "menu-user",            // 用户管理菜单
    "menu-user:list",       // 用户查询按钮
    "menu-user:add",        // 用户新增按钮
    "menu-user:edit",       // 用户修改按钮
    "menu-role",            // 角色管理菜单
    "menu-role:list"        // 角色查询按钮
  ]
}
```

分配后，拥有该角色的用户只能看到被授权的菜单和按钮。

## 数据范围

数据范围控制用户能看到哪些用户数据。角色管理页的“数据权限”操作可以单独配置范围；选择自定义部门时可在部门树中多选。

| dataScope | 含义 | SQL 条件示例 |
|-----------|------|-------------|
| `1` | 全部数据 | 无额外条件 |
| `2` | 本部门数据 | `dept_id = 当前部门` |
| `3` | 本部门及以下 | `dept_id IN (当前部门及有效子部门)` |
| `4` | 仅本人数据 | 用户资源按 `id = 当前用户` |
| `5` | 自定义部门 | `dept_id IN (角色选择的部门)` |

```http
GET /api/system/roles/{id}/data-scope

PUT /api/system/roles/{id}/data-scope
Content-Type: application/json

{
  "scope": 5,
  "deptIds": ["dept-001", "dept-002"]
}
```

范围 1—4 禁止携带 `deptIds`；范围 5 必须至少选择一个有效部门。保存角色范围和角色部门关联在同一数据库事务中完成。

### 数据范围过滤

一个用户有多个角色时，各角色范围取并集。任一角色拥有全部数据权限时不增加范围条件；否则部门范围与本人范围使用 `OR` 合并。没有部门、自定义部门全部失效或没有有效角色时按无数据处理，不会退化为全部数据。

```typescript
const scope = await dataScopeResolver.resolve(currentUser);
await userService.list({ page: 1, pageSize: 20, dataScope: scope });
```

用户管理的列表、详情、创建目标部门、修改、删除、重置密码、状态修改、解锁、黑名单、批量操作、用户标签和导出均执行数据范围检查。越权访问详情或写操作返回“用户不存在”，批量操作跳过越权目标。非数据库当前 admin 不能修改拥有有效 admin 角色的用户。其他业务资源接入时，需要在模块的组合根注册该资源的部门字段或创建人字段，不能假设框架会自动识别业务表结构。

## 权限加载器

权限加载器负责从数据库加载权限数据并注入到 RBAC 引擎中。

### 加载流程

```
用户登录 → 查询角色列表 → 查询菜单权限 → 构建 PermissionSet → 注入 RBAC 引擎 → 缓存
```

```typescript
// 权限加载器
async function loadUserPermissions(userId: string, tenantId: string): Promise<PermissionSet> {
  // 1. 查询缓存
  const cached = await cache.get(`perms:${tenantId}:${userId}`);
  if (cached) return JSON.parse(cached);

  // 2. 查询用户角色
  const roles = await db.query`
    SELECT r.* FROM sys_role r
    INNER JOIN sys_user_role ur ON r.id = ur.role_id
    WHERE ur.user_id = ${userId} AND r.status = 0
  `;

  // 3. 查询角色关联的菜单权限
  const permissions = new Set<string>();
  for (const role of roles) {
    const menus = await db.query`
      SELECT m.permission FROM sys_menu m
      INNER JOIN sys_role_menu rm ON m.id = rm.menu_id
      WHERE rm.role_id = ${role.id} AND m.permission IS NOT NULL
    `;
    for (const menu of menus) {
      permissions.add(menu.permission);
    }
  }

  const result = {
    roles: roles.map(r => r.name),
    permissions: Array.from(permissions),
    dataScope: roles.reduce((scope, role) => {
      // 多角色时取最大权限
      return mergeDataScope(scope, role.dataScope);
    }, 'self'),
  };

  // 4. 缓存（TTL 5 分钟）
  await cache.set(`perms:${tenantId}:${userId}`, JSON.stringify(result), { ttl: 300 });

  return result;
}
```

### 缓存失效

以下操作会触发权限缓存失效：

- 用户角色变更
- 角色菜单权限变更
- 角色数据范围变更
- 用户被停用或删除
- 用户被强制下线

```typescript
// 缓存失效示例
async function invalidateUserPermissions(userId: string, tenantId: string) {
  await cache.del(`perms:${tenantId}:${userId}`);
}

async function invalidateRolePermissions(roleId: string, tenantId: string) {
  // 查询所有拥有该角色的用户，批量清除缓存
  const users = await db.query`
    SELECT user_id FROM sys_user_role WHERE role_id = ${roleId}
  `;
  for (const user of users) {
    await cache.del(`perms:${tenantId}:${user.user_id}`);
  }
}
```
