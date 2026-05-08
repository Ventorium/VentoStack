---
order: 8
title: 策略引擎
description: 使用 createPolicyEngine 实现类 Casbin 的通配符策略匹配与条件表达式
---

`createPolicyEngine` 提供了类 Casbin 的策略引擎，支持 subject / resource / action 通配符匹配和条件表达式（conditions）。默认 deny，只有匹配 allow 规则且无 deny 规则时才允许访问。

## 基本用法

```typescript
import { createPolicyEngine } from "@ventostack/auth";

const engine = createPolicyEngine();

// 允许 admin 角色对所有资源执行所有操作
engine.addRule({
  effect: "allow",
  subjects: ["admin"],
  resources: ["*"],
  actions: ["*"],
});

// 允许 editor 对 post 资源执行读写操作
engine.addRule({
  effect: "allow",
  subjects: ["editor"],
  resources: ["post"],
  actions: ["read", "write"],
});

// 拒绝所有用户删除系统配置
engine.addRule({
  effect: "deny",
  subjects: ["*"],
  resources: ["system-config"],
  actions: ["delete"],
});
```

## 访问判定

```typescript
const result = engine.evaluate({
  subject: "admin",
  resource: "user",
  action: "delete",
});

console.log(result.allowed);    // true
console.log(result.matchedRule); // { effect: "allow", subjects: ["admin"], ... }
```

**判定规则：**
- 遍历所有规则，按 subject → resource → action → conditions 顺序匹配
- 匹配到 `deny` 规则立即返回拒绝
- 仅匹配到 `allow` 规则时允许
- 无任何匹配规则 → 拒绝

## 通配符匹配

subject / resource / actions 均支持 `*` 通配符：

```typescript
// 匹配所有以 "user:" 开头的主体
engine.addRule({
  effect: "allow",
  subjects: ["user:*"],
  resources: ["profile"],
  actions: ["read"],
});

// 评估
engine.evaluate({ subject: "user:123", resource: "profile", action: "read" });
// { allowed: true }
```

## 条件表达式

通过 `conditions` 对请求的 `attributes` 进行细粒度匹配：

```typescript
engine.addRule({
  effect: "allow",
  subjects: ["user"],
  resources: ["document"],
  actions: ["read"],
  conditions: [
    { field: "department", operator: "eq", value: "engineering" },
    { field: "level", operator: "gte", value: 3 },
  ],
});

engine.evaluate({
  subject: "user",
  resource: "document",
  action: "read",
  attributes: { department: "engineering", level: 5 },
});
// { allowed: true }
```

支持的操作符：

| 操作符 | 说明 | 示例值 |
|--------|------|--------|
| `eq` | 等于 | `"active"` |
| `neq` | 不等于 | `"banned"` |
| `in` | 包含于 | `["admin", "editor"]` |
| `not_in` | 不包含于 | `["banned"]` |
| `gt` / `lt` | 大于 / 小于 | `10` |
| `gte` / `lte` | 大于等于 / 小于等于 | `3` |
| `matches` | 正则匹配 | `"^user:.*"` |

## 规则管理

```typescript
// 获取所有规则
const rules = engine.getRules();

// 移除指定索引的规则
engine.removeRule(0); // true

// 清空所有规则
engine.clear();
```

## 接口参考

```typescript
interface PolicyRule {
  effect: "allow" | "deny";
  subjects: string[];   // 支持 * 通配符
  resources: string[];  // 支持 * 通配符
  actions: string[];    // 支持 * 通配符
  conditions?: PolicyConditionDef[];
}

interface PolicyConditionDef {
  field: string;
  operator: "eq" | "neq" | "in" | "not_in" | "gt" | "lt" | "gte" | "lte" | "matches";
  value: unknown;
}

interface PolicyEngine {
  addRule(rule: PolicyRule): void;
  removeRule(index: number): boolean;
  evaluate(ctx: PolicyEvalContext): { allowed: boolean; matchedRule?: PolicyRule };
  getRules(): PolicyRule[];
  clear(): void;
}
```

## 注意事项

- 规则按添加顺序评估，`deny` 规则命中后立即返回，不再检查后续规则
- 当规则定义了 `conditions` 但请求未提供 `attributes` 时，该规则不匹配
- 规则基于内存数组存储，重启后需重新加载
