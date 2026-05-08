---
title: Validator
description: Schema 校验器，支持请求体和查询参数的声明式校验
---

`validate` 函数用于通用数据校验，`validateBody` 和 `validateQuery` 是开箱即用的中间件。

## 基本校验

```typescript
import { validate } from "@ventostack/core";

const schema = {
  name: { type: "string", required: true, min: 1, max: 50 },
  age:  { type: "number", min: 0, max: 200 },
  role: { type: "string", enum: ["admin", "user"] },
};

const result = validate({ name: "Alice", age: 25, role: "admin" }, schema);
// { valid: true, errors: [] }
```

## 请求体校验中间件

```typescript
import { validateBody } from "@ventostack/core";

app.post("/users", validateBody({
  name:  { type: "string", required: true, min: 1 },
  email: { type: "string", required: true, pattern: /^.+@.+$/ },
}), (ctx) => {
  return ctx.json({ ok: true });
});
```

校验失败自动返回 `400`，响应体包含 `errors` 数组。

## 查询参数校验中间件

```typescript
import { validateQuery } from "@ventostack/core";

app.get("/search", validateQuery({
  q:    { type: "string", required: true },
  page: { type: "number", min: 1 },
}), (ctx) => {
  return ctx.json({ query: ctx.query });
});
```

## 嵌套对象与数组

```typescript
const schema = {
  tags: { type: "array", required: true, min: 1, items: { type: "string" } },
  address: {
    type: "object",
    properties: {
      city:   { type: "string", required: true },
      zip:    { type: "string", pattern: /^\d{6}$/ },
    },
  },
};
```

## 自定义校验

```typescript
const schema = {
  email: {
    type: "string",
    required: true,
    custom(value) {
      return value.includes("@") ? null : "邮箱格式不正确";
    },
  },
};
```

## 配置选项

### FieldRule

| 属性 | 类型 | 说明 |
|------|------|------|
| `type` | `"string" \| "number" \| "boolean" \| "array" \| "object"` | 字段类型（必填） |
| `required` | `boolean` | 是否必填 |
| `min` | `number` | 最小值（数字）/ 最小长度（字符串）/ 最少元素（数组） |
| `max` | `number` | 最大值 / 最大长度 / 最多元素 |
| `pattern` | `RegExp` | 正则匹配 |
| `enum` | `unknown[]` | 枚举值列表 |
| `items` | `FieldRule` | 数组元素规则 |
| `properties` | `Record<string, FieldRule>` | 对象属性规则 |
| `custom` | `(value) => string \| null` | 自定义校验，返回错误字符串或 `null` |
