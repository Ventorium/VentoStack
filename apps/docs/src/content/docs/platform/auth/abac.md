---
order: 7
title: ABAC 属性访问控制
description: 使用 createABAC 实现基于属性的访问控制（Attribute-Based Access Control）
---

`createABAC` 提供了基于属性的访问控制（ABAC），通过自定义条件函数对主体（subject）、资源（resource）、上下文（context）属性进行细粒度判定。默认 deny，deny 策略优先于 allow；基于内存 Map 存储策略。

## 基本用法

```typescript
import { createABAC } from "@ventostack/auth";

const abac = createABAC();

// 添加 allow 策略：仅限本人访问自己的资源
abac.addPolicy({
  name: "owner-only",
  effect: "allow",
  condition: (subject, resource) => subject.id === resource.ownerId,
});

// 添加 deny 策略：禁止非活跃用户
abac.addPolicy({
  name: "block-inactive",
  effect: "deny",
  condition: (subject) => subject.status !== "active",
});

// 添加 deny 策略：工作时间外禁止敏感操作
abac.addPolicy({
  name: "no-sensitive-outside-hours",
  effect: "deny",
  condition: (subject, resource, context) =>
    resource.sensitive === true && context?.workHours !== true,
});
```

## 访问判定

```typescript
const result = abac.evaluate(
  { id: "user-1", status: "active" },        // 主体属性
  { ownerId: "user-1", sensitive: false },     // 资源属性
  { workHours: true },                         // 上下文属性
);

console.log(result.allowed);        // true
console.log(result.matchedPolicies); // ["owner-only"]
```

**判定规则：**
- 匹配到 `deny` 策略 → 拒绝
- 仅匹配到 `allow` 策略 → 允许
- 无任何匹配策略 → 拒绝

## 策略管理

```typescript
// 列出所有策略
const policies = abac.listPolicies();

// 移除策略，返回是否成功
const removed = abac.removePolicy("block-inactive"); // true
```

## 在路由中使用

```typescript
const requireABAC = (
  resourceFn: (ctx: Context) => Record<string, unknown>,
  contextFn?: (ctx: Context) => Record<string, unknown>,
): Middleware => {
  return async (ctx, next) => {
    const user = ctx.state.user;
    const resource = resourceFn(ctx);
    const context = contextFn?.(ctx);
    const { allowed } = abac.evaluate(user, resource, context);
    if (!allowed) {
      throw new ForbiddenError("访问被拒绝");
    }
    await next();
  };
};
```

## 接口参考

```typescript
interface Policy {
  name: string;
  effect: "allow" | "deny";
  condition: (
    subject: Record<string, unknown>,
    resource: Record<string, unknown>,
    context?: Record<string, unknown>,
  ) => boolean;
}

interface ABAC {
  addPolicy(policy: Policy): void;
  removePolicy(name: string): boolean;
  evaluate(subject, resource, context?): { allowed: boolean; matchedPolicies: string[] };
  listPolicies(): Policy[];
}
```

## 注意事项

- 策略基于内存 Map 存储，重启后丢失，需在应用启动时重新注册
- 条件函数在评估时同步执行，避免在条件中执行异步或耗时操作
- `deny` 始终优先于 `allow`，即使同时匹配到两种策略
