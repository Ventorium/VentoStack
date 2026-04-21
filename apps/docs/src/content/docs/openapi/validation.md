---
title: 请求验证
description: 使用 createRequestValidator 对请求数据进行 Schema 验证
---

`createRequestValidator` 提供了基于 JSON Schema 的请求体、查询参数和路径参数验证。

## 基本用法

```typescript
import { createRequestValidator } from "@aeron/openapi";

const validator = createRequestValidator();

// 定义 schema
const createUserSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 2, maxLength: 100 },
    email: { type: "string", format: "email" },
    age: { type: "integer", minimum: 0, maximum: 150 },
  },
  required: ["name", "email"],
  additionalProperties: false,
};
```

## 作为中间件使用

```typescript
import { ValidationError } from "@aeron/core";

// 创建验证中间件
const validateBody = (schema: object) => async (ctx: Context, next: NextFunction) => {
  const body = await ctx.body();
  const result = validator.validate(body, schema);

  if (!result.valid) {
    throw new ValidationError("请求数据验证失败", result.errors);
  }

  ctx.state.validatedBody = result.data;
  await next();
};

// 应用到路由
router.post("/users",
  validateBody(createUserSchema),
  async (ctx) => {
    const body = ctx.state.validatedBody as CreateUserInput;
    const user = await createUser(body);
    return ctx.json(user, 201);
  }
);
```

## 验证查询参数

```typescript
const listQuerySchema = {
  type: "object",
  properties: {
    page: { type: "string", pattern: "^[0-9]+$" },
    limit: { type: "string", pattern: "^[0-9]+$" },
    search: { type: "string", maxLength: 100 },
  },
};

router.get("/users",
  validateQuery(listQuerySchema),
  async (ctx) => {
    const { page = "1", limit = "20", search } = ctx.query;
    // 已验证的参数
  }
);
```

## 验证错误格式

验证失败时返回结构化的错误信息：

```json
{
  "error": "请求数据验证失败",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "email", "message": "邮箱格式无效" },
    { "field": "name", "message": "姓名不能少于 2 个字符" }
  ]
}
```

## RequestValidator 接口

```typescript
interface ValidationResult {
  valid: boolean;
  data?: unknown;
  errors?: Array<{ field: string; message: string }>;
}

interface RequestValidator {
  validate(data: unknown, schema: object): ValidationResult;
}
```
