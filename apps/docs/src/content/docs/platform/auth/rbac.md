---
order: 4
title: RBAC 权限控制
description: 使用 createRBAC 实现基于角色的访问控制
---

`createRBAC` 提供了基于角色的访问控制（Role-Based Access Control），默认 deny，必须显式授权；基于内存 Map 存储角色与权限关系。

## 基本用法

```typescript
import { createRBAC } from "@ventostack/auth";

const rbac = createRBAC();

// 定义权限（Permission 是 { resource, action } 对象）
rbac.addRole({
  name: "admin",
  permissions: [
    { resource: "user", action: "read" },
    { resource: "user", action: "write" },
    { resource: "user", action: "delete" },
    { resource: "post", action: "read" },
    { resource: "post", action: "write" },
    { resource: "post", action: "delete" },
  ],
});

rbac.addRole({
  name: "editor",
  permissions: [
    { resource: "post", action: "read" },
    { resource: "post", action: "write" },
    { resource: "user", action: "read" },
  ],
});

rbac.addRole({
  name: "viewer",
  permissions: [
    { resource: "post", action: "read" },
    { resource: "user", action: "read" },
  ],
});
```

## 权限检查

### 检查单个角色是否拥有某权限

```typescript
// hasPermission(roleName, resource, action)
rbac.hasPermission("admin", "user", "delete");  // true
rbac.hasPermission("editor", "user", "delete"); // false
rbac.hasPermission("viewer", "post", "read");   // true
```

### 检查一组角色中是否有任一角色拥有某权限

```typescript
// can(roles[], resource, action)
rbac.can(["admin"], "user", "delete");          // true
rbac.can(["editor", "viewer"], "user", "write"); // false
rbac.can(["viewer", "admin"], "post", "read");  // true
```

## 在路由中使用

```typescript
// 权限检查中间件工厂
const requirePermission = (resource: string, action: string): Middleware => {
  return async (ctx, next) => {
    const user = ctx.state.user as { roles: string[] };
    if (!rbac.can(user.roles, resource, action)) {
      throw new ForbiddenError(`需要 ${resource}:${action} 权限`);
    }
    await next();
  };
};

// 使用
router.delete("/users/:id<int>",
  authMiddleware,
  requirePermission("user", "delete"),
  async (ctx) => {
    await db.query(UserModel).where("id", "=", ctx.params.id).hardDelete();
    return ctx.json({ ok: true });
  }
);
```

## 查询角色

```typescript
// 获取单个角色定义
const adminRole = rbac.getRole("admin");
// adminRole: { name: "admin", permissions: [...] }

// 列出所有已注册的角色
const allRoles = rbac.listRoles();
// allRoles: [{ name: "admin", permissions: [...] }, { name: "editor", ... }]
```

## 移除角色

```typescript
rbac.removeRole("viewer");
rbac.hasPermission("viewer", "post", "read"); // false
```

## RBAC 接口

```typescript
/** 权限定义 */
interface Permission {
  /** 资源标识（如 "user", "order", "post"） */
  resource: string;
  /** 操作类型（如 "read", "write", "delete"） */
  action: string;
}

/** 角色定义 */
interface Role {
  /** 角色名称 */
  name: string;
  /** 角色拥有的权限列表 */
  permissions: Permission[];
}

/** RBAC 管理器接口 */
interface RBAC {
  /**
   * 添加角色
   * @param role 角色定义
   */
  addRole(role: Role): void;

  /**
   * 移除角色
   * @param name 角色名称
   */
  removeRole(name: string): void;

  /**
   * 获取角色定义
   * @param name 角色名称
   * @returns 角色定义，不存在时返回 undefined
   */
  getRole(name: string): Role | undefined;

  /**
   * 判断指定角色是否拥有某权限
   * @param roleName 角色名称
   * @param resource 资源标识
   * @param action 操作类型
   * @returns 拥有权限返回 true，否则返回 false
   */
  hasPermission(roleName: string, resource: string, action: string): boolean;

  /**
   * 判断一组角色中是否有任一角色拥有某权限
   * @param roles 角色名称列表
   * @param resource 资源标识
   * @param action 操作类型
   * @returns 拥有权限返回 true，否则返回 false
   */
  can(roles: string[], resource: string, action: string): boolean;

  /**
   * 列出所有已注册的角色
   * @returns 角色列表
   */
  listRoles(): Role[];
}
```

## 注意事项

- 不支持角色继承（`extends`），每个角色的权限必须完整定义
- 权限使用 `{ resource, action }` 对象表示，而非 `"resource:action"` 字符串
- `can()` 接收角色名称数组，适用于用户拥有多个角色的场景
- `hasPermission()` 用于单角色检查，内部被 `can()` 复用
