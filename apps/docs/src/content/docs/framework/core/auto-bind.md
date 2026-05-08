---
title: Auto Bind
description: 自动绑定工具，从 JSON/Form/Query 解析并校验请求数据
---

`bindJSON`、`bindForm`、`bindQuery` 提供了从请求中自动解析、类型转换和 Schema 校验的一体化方案。

## 绑定 JSON Body

```typescript
import { bindJSON } from "@ventostack/core";

const schema = {
  name:  { type: "string", required: true, min: 1, max: 50 },
  email: { type: "string", required: true },
  age:   { type: "number", min: 0 },
};

app.post("/users", async (ctx) => {
  const { data, errors } = await bindJSON(ctx, schema);
  if (errors.length) {
    return ctx.json({ errors }, 400);
  }
  return ctx.json(data);
});
```

## 绑定 Form Body

从 `application/x-www-form-urlencoded` 解析，自动根据 Schema 做类型转换：

```typescript
import { bindForm } from "@ventostack/core";

app.post("/login", async (ctx) => {
  const { data, errors } = await bindForm(ctx, {
    username: { type: "string", required: true },
    remember: { type: "boolean" },  // "true"/"1" → true
  });
  if (errors.length) return ctx.json({ errors }, 400);
  return ctx.json(data);
});
```

## 绑定 Query 参数

同步操作，从 URL 查询参数解析：

```typescript
import { bindQuery } from "@ventostack/core";

app.get("/search", (ctx) => {
  const { data, errors } = bindQuery(ctx, {
    q:    { type: "string", required: true },
    page: { type: "number", min: 1 },  // "1" → 1
  });
  if (errors.length) return ctx.json({ errors }, 400);
  return ctx.json({ query: data });
});
```

## 安全限制

`bindJSON` 和 `bindForm` 内置以下安全检查：

| 检查项 | 默认值 |
|--------|--------|
| Content-Type 校验 | 必须匹配 |
| 最大 Body 大小 | 1 MB |
| 最大嵌套深度（仅 JSON） | 10 层 |

## 配置选项

### BindOptions

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxBodySize` | `number` | `1048576`（1MB） | 最大 Body 大小（字节） |
| `maxDepth` | `number` | `10` | JSON 最大嵌套深度 |

### BindResult

| 属性 | 类型 | 说明 |
|------|------|------|
| `data` | `T` | 解析后的数据 |
| `errors` | `string[]` | 校验错误列表，空数组表示通过 |
