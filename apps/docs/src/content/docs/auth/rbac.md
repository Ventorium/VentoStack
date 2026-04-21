---
title: RBAC 权限控制
description: 使用 createRBAC 实现基于角色的访问控制
---

`createRBAC` 提供了基于角色的访问控制（Role-Based Access Control），支持角色继承和细粒度权限定义。

## 基本用法

```typescript
import { createRBAC } from "@aeron/auth";

const rbac = createRBAC();

// 定义权限
rbac.addRole("admin", [
  "users:read",
  "users:write",
  "users:delete",
  "posts:read",
  "posts:write",
  "posts:delete",
]);

rbac.addRole("editor", [
  "posts:read",
  "posts:write",
  "users:read",
]);

rbac.addRole("viewer", [
  "posts:read",
  "users:read",
]);
```

## 权限检查

```typescript
// 检查角色是否有权限
rbac.can("admin", "users:delete");  // true
rbac.can("editor", "users:delete"); // false
rbac.can("viewer", "posts:read");   // true
```

## 在路由中使用

```typescript
// 权限检查中间件工厂
const requirePermission = (permission: string): Middleware => {
  return async (ctx, next) => {
    const user = ctx.state.user as { role: string };
    if (!rbac.can(user.role, permission)) {
      throw new ForbiddenError(`需要 ${permission} 权限`);
    }
    await next();
  };
};

// 使用
router.delete("/users/:id",
  authMiddleware,
  requirePermission("users:delete"),
  async (ctx) => {
    await db.delete("users").where("id", "=", ctx.params.id).execute();
    return ctx.json({ ok: true });
  }
);
```

## 角色继承

子角色继承父角色的所有权限：

```typescript
// 定义基础权限
rbac.addRole("user", ["posts:read"]);

// 编辑者继承用户权限，并添加额外权限
rbac.addRole("editor", ["posts:write", "posts:update"], { extends: "user" });

// 管理员继承编辑者权限
rbac.addRole("admin", ["posts:delete", "users:manage"], { extends: "editor" });

rbac.can("admin", "posts:read");  // true（通过继承）
rbac.can("editor", "posts:read"); // true（通过继承）
```

## 动态权限检查

```typescript
// 基于资源所有者的权限
const canEditPost = async (userId: string, postId: string): Promise<boolean> => {
  if (rbac.can(user.role, "posts:write:all")) {
    return true; // 管理员可以编辑所有文章
  }

  const post = await db.from("posts").where("id", "=", postId).first();
  return post?.user_id === userId; // 只能编辑自己的文章
};
```

## RBAC 接口

```typescript
interface RBACOptions {
  extends?: string;  // 继承的父角色
}

interface RBAC {
  addRole(role: string, permissions: string[], options?: RBACOptions): void;
  can(role: string, permission: string): boolean;
  getPermissions(role: string): string[];
  getRoles(): string[];
}
```
