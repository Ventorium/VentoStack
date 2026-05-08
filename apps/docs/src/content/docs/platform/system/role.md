---
order: 4
title: 角色与权限
description: '角色与权限管理模块提供角色 CRUD、菜单权限分配、数据范围控制及权限加载器，实现从数据库到 RBAC 引擎的完整权限链路。'
---

## 概述

角色与权限管理基于 `@ventostack/auth` 的 RBAC 引擎，在平台层提供面向业务的角色管理、菜单权限分配和数据范围控制。

## 角色 CRUD

### 创建角色

```typescript
POST /api/system/role
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
GET /api/system/role?page=1&pageSize=10&name=editor

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
PUT /api/system/role/{id}
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
DELETE /api/system/role/{id}

// 前置检查：
// 1. 角色下是否存在用户 → 存在则拒绝删除
// 2. 角色是否为系统内置角色 → 内置角色不可删除
```

## 菜单权限分配

角色通过关联菜单实现功能权限控制。每个菜单项对应一个功能入口，菜单的 `permission` 字段用于后端权限校验。

```typescript
// 分配菜单权限
PUT /api/system/role/{id}/menus
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

数据范围控制用户能看到哪些数据，通过 `dataScope` 字段配置：

| dataScope | 含义 | SQL 条件示例 |
|-----------|------|-------------|
| `all` | 全部数据 | 无额外条件 |
| `dept` | 本部门数据 | `WHERE dept_id = user.deptId` |
| `dept_and_sub` | 本部门及以下 | `WHERE dept_id IN (子部门ID列表)` |
| `self` | 仅本人数据 | `WHERE create_by = user.id` |
| `dept_custom` | 自定义部门 | `WHERE dept_id IN (role.deptIds)` |

### 数据范围过滤

数据范围在查询时自动注入，不需要业务代码手动处理：

```typescript
// 框架内部的数据权限过滤逻辑
function applyDataScope(query: SelectQuery, user: User, role: Role): SelectQuery {
  switch (role.dataScope) {
    case 'all':
      return query;
    case 'dept':
      return query.where('dept_id', '=', user.deptId);
    case 'dept_and_sub':
      const subDeptIds = getSubDeptIds(user.deptId);
      return query.whereIn('dept_id', subDeptIds);
    case 'self':
      return query.where('create_by', '=', user.id);
    case 'dept_custom':
      return query.whereIn('dept_id', role.deptIds);
  }
}
```

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
