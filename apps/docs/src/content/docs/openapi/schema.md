---
title: Schema 定义
description: 使用 defineSchema 和 generateOpenAPISpec 生成 OpenAPI 3.1 文档
---

`@aeron/openapi` 提供了从代码自动生成 OpenAPI 3.1 规范的能力，保持文档与代码同步。

## 定义 Schema

```typescript
import { defineSchema, generateOpenAPISpec } from "@aeron/openapi";

const UserSchema = defineSchema({
  type: "object",
  properties: {
    id: { type: "string", description: "用户唯一 ID" },
    name: { type: "string", description: "用户姓名", minLength: 2, maxLength: 100 },
    email: { type: "string", format: "email", description: "邮箱地址" },
    role: { type: "string", enum: ["admin", "user", "viewer"] },
    createdAt: { type: "string", format: "date-time" },
  },
  required: ["id", "name", "email", "role"],
});

const CreateUserSchema = defineSchema({
  type: "object",
  properties: {
    name: { type: "string", minLength: 2 },
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 8 },
  },
  required: ["name", "email", "password"],
});
```

## 定义 API 端点

```typescript
import { defineOperation } from "@aeron/openapi";

const listUsers = defineOperation({
  summary: "获取用户列表",
  tags: ["users"],
  parameters: [
    { name: "page", in: "query", schema: { type: "integer", default: 1 } },
    { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
  ],
  responses: {
    200: {
      description: "成功返回用户列表",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: { type: "array", items: UserSchema },
              total: { type: "integer" },
            },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
});
```

## 生成 OpenAPI 规范

```typescript
const spec = generateOpenAPISpec({
  info: {
    title: "My API",
    version: "1.0.0",
    description: "API 文档",
  },
  servers: [
    { url: "https://api.example.com", description: "生产环境" },
    { url: "http://localhost:3000", description: "开发环境" },
  ],
  paths: {
    "/users": {
      get: listUsers,
      post: createUser,
    },
    "/users/{id}": {
      get: getUser,
      put: updateUser,
      delete: deleteUser,
    },
  },
  components: {
    schemas: { User: UserSchema, CreateUser: CreateUserSchema },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
});
```

## 暴露文档端点

```typescript
// 提供 JSON 格式的 OpenAPI 规范
router.get("/openapi.json", async (ctx) => {
  return ctx.json(spec);
});

// 提供 Swagger UI（需要引入 swagger-ui 静态文件）
router.get("/docs", async (ctx) => {
  return ctx.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>API 文档</title>
        <meta charset="utf-8"/>
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" >
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"> </script>
        <script>
          SwaggerUIBundle({ url: "/openapi.json", dom_id: '#swagger-ui' })
        </script>
      </body>
    </html>
  `);
});
```
