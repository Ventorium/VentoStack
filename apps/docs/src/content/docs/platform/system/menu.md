---
order: 5
title: 菜单管理
description: '菜单管理模块提供菜单树结构管理、权限标识符定义、动态路由生成及菜单树构建器。'
---

## 概述

菜单管理是系统权限体系的核心组成部分，通过树形结构管理系统的导航菜单和操作按钮。每个菜单项可配置权限标识符，用于后端接口的权限校验。

## 菜单类型

菜单分为三种类型：

| 类型 | 说明 | 典型用途 |
|------|------|---------|
| `directory` | 目录 | 侧边栏分组，如「系统管理」 |
| `menu` | 菜单 | 可导航的页面，如「用户管理」 |
| `button` | 按钮 | 页面内操作按钮，如「新增」「删除」 |

### 树形结构示例

```
系统管理 (directory)
├── 用户管理 (menu, permission: system:user:list)
│   ├── 用户新增 (button, permission: system:user:add)
│   ├── 用户修改 (button, permission: system:user:edit)
│   ├── 用户删除 (button, permission: system:user:remove)
│   └── 重置密码 (button, permission: system:user:resetPwd)
├── 角色管理 (menu, permission: system:role:list)
│   ├── 角色新增 (button, permission: system:role:add)
│   ├── 角色修改 (button, permission: system:role:edit)
│   └── 角色删除 (button, permission: system:role:remove)
└── 菜单管理 (menu, permission: system:menu:list)
    ├── 菜单新增 (button, permission: system:menu:add)
    └── 菜单修改 (button, permission: system:menu:edit)
```

## CRUD 操作

### 创建菜单

```typescript
POST /api/system/menu
{
  "parentId": "menu-system",        // 父菜单 ID，根菜单为 "0"
  "name": "user",
  "label": "用户管理",
  "type": "menu",                   // directory | menu | button
  "path": "/system/user",
  "component": "system/user/index",
  "icon": "user",
  "permission": "system:user:list",
  "sort": 1,
  "visible": true,
  "status": 0,
  "remark": "用户管理菜单"
}
```

### 查询菜单树

```typescript
GET /api/system/menu?name=user&status=0

// 返回完整菜单树
[
  {
    "id": "menu-system",
    "name": "system",
    "label": "系统管理",
    "type": "directory",
    "icon": "setting",
    "sort": 1,
    "children": [
      {
        "id": "menu-user",
        "name": "user",
        "label": "用户管理",
        "type": "menu",
        "path": "/system/user",
        "permission": "system:user:list",
        "children": [
          {
            "id": "menu-user-add",
            "name": "user-add",
            "label": "用户新增",
            "type": "button",
            "permission": "system:user:add"
          }
        ]
      }
    ]
  }
]
```

### 更新菜单

```typescript
PUT /api/system/menu/{id}
{
  "label": "用户管理(新)",
  "icon": "peoples",
  "sort": 2
}
```

### 删除菜单

```typescript
DELETE /api/system/menu/{id}

// 前置检查：
// 1. 是否存在子菜单 → 存在则拒绝删除
// 2. 是否被角色引用 → 引用中则拒绝删除
```

## 权限标识符

权限标识符采用三段式命名规则：`模块:业务:操作`。

### 命名规范

```
{module}:{business}:{action}

示例：
system:user:list      // 系统模块-用户-查询
system:user:add       // 系统模块-用户-新增
system:user:edit      // 系统模块-用户-修改
system:user:remove    // 系统模块-用户-删除
system:user:resetPwd  // 系统模块-用户-重置密码
system:user:export    // 系统模块-用户-导出
system:user:import    // 系统模块-用户-导入
```

### 后端权限校验

权限标识符在路由中间件中使用：

```typescript
import { createPermMiddleware } from '@ventostack/system';

const perm = createPermMiddleware(rbac);

// 路由级权限控制
router.get('/api/system/user', listUsers, perm('system', 'user:list'));
router.post('/api/system/user', createUser, perm('system', 'user:add'));
router.put('/api/system/user/:id', updateUser, perm('system', 'user:edit'));
router.delete('/api/system/user/:id', deleteUser, perm('system', 'user:remove'));
```

## 动态路由生成

前端根据用户权限动态生成路由。后端提供菜单接口返回当前用户有权限的菜单树：

```typescript
GET /api/system/menu/routes

// 响应：仅返回当前用户有权限的菜单项
// 1. 查询用户角色
// 2. 查询角色关联的菜单 ID 集合
// 3. 过滤菜单树，仅保留有权限的节点
// 4. 移除 type=button 的节点（按钮不参与路由）
```

前端消费示例：

```typescript
// 前端路由生成逻辑（伪代码）
const menuRoutes = await fetch('/api/system/menu/routes');
const routes = buildRoutes(menuRoutes);

function buildRoutes(menus: Menu[]): RouteRecordRaw[] {
  return menus
    .filter(m => m.type !== 'button')
    .map(menu => ({
      path: menu.path,
      component: () => import(`@/views/${menu.component}.vue`),
      meta: { title: menu.label, icon: menu.icon },
      children: menu.children ? buildRoutes(menu.children) : [],
    }));
}
```

## MenuTreeBuilder

`MenuTreeBuilder` 是将扁平菜单列表转换为嵌套树结构的工具函数：

```typescript
import { createMenuTreeBuilder } from '@ventostack/system';

const builder = createMenuTreeBuilder();

// 从数据库查询的扁平列表
const flatMenus = await db.query`SELECT * FROM sys_menu WHERE status = 0 ORDER BY sort`;

// 构建树结构
const menuTree = builder.build(flatMenus);

// 过滤有权限的菜单
const filteredTree = builder.filterByPermission(menuTree, userPermissions);

// 提取路由（移除 button 类型）
const routeTree = builder.toRoutes(filteredTree);
```

### Builder API

```typescript
interface MenuTreeBuilder {
  /** 将扁平列表构建为树结构 */
  build(items: FlatMenuItem[]): MenuTreeNode[];

  /** 根据权限标识符集合过滤菜单树 */
  filterByPermission(tree: MenuTreeNode[], permissions: Set<string>): MenuTreeNode[];

  /** 提取路由树（移除 button 类型节点） */
  toRoutes(tree: MenuTreeNode[]): RouteMenuItem[];

  /** 获取所有权限标识符 */
  extractPermissions(tree: MenuTreeNode[]): string[];

  /** 排序 */
  sort(tree: MenuTreeNode[]): MenuTreeNode[];
}
```
