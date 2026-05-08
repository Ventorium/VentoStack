---
order: 1
title: OpenAPI Schema 定义与文档生成
description: 使用 Schema 构建函数、路由元数据和 setupOpenAPI 自动生成 OpenAPI 3.0 文档
---

`@ventostack/openapi` 提供从代码自动生成 OpenAPI 3.0 规范的能力，保持文档与代码同步。核心设计原则：

- **零额外维护**：路由 Schema 配置同时驱动类型推导、运行时校验和 OpenAPI 生成
- **自动推断**：未显式声明时，从 handler 返回值推断响应类型
- **渐进式增强**：从全自动到全手动控制，按需选择粒度

## 一键接入

推荐方式：使用 `setupOpenAPI` 在应用层级一键注册 OpenAPI JSON 端点和文档 UI。

```typescript
import { createApp } from "@ventostack/core";
import { setupOpenAPI } from "@ventostack/openapi";

const app = createApp({ port: 3000 });

// 注册你的路由...
// app.use(userRouter);

// 一键接入 OpenAPI
setupOpenAPI(app, {
  info: {
    title: "My API",
    version: "1.0.0",
    description: "API 文档",
  },
  servers: [
    { url: "https://api.example.com", description: "生产环境" },
    { url: "http://localhost:3000", description: "开发环境" },
  ],
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    },
  },
  docsTitle: "My API Documentation",
});

await app.listen();
```

接入后自动获得两个端点：

- `GET /openapi.json` — OpenAPI 3.0 JSON 规范
- `GET /docs` — Scalar UI 文档页面

### 自定义路径

```typescript
setupOpenAPI(app, {
  info: { title: "My API", version: "1.0.0" },
  jsonPath: "/api-spec.json",   // 自定义 JSON 路径
  docsPath: "/api-docs",        // 自定义 UI 路径
});
```

## Schema 构建函数

使用工厂函数创建各类 OpenAPI Schema 对象：

```typescript
import {
  schemaString,
  schemaNumber,
  schemaInteger,
  schemaBoolean,
  schemaArray,
  schemaObject,
  schemaEnum,
  schemaRef,
} from "@ventostack/openapi";

// 字符串类型
const nameSchema = schemaString({
  description: "用户姓名",
  minLength: 2,
  maxLength: 100,
  example: "Alice",
});

// 数字类型
const ageSchema = schemaNumber({
  description: "用户年龄",
  minimum: 0,
  maximum: 150,
  example: 25,
});

// 整数类型
const countSchema = schemaInteger({
  description: "计数",
  minimum: 0,
  example: 10,
});

// 布尔类型
const activeSchema = schemaBoolean({
  description: "是否激活",
  example: true,
});

// 数组类型
const tagsSchema = schemaArray(schemaString(), {
  description: "标签列表",
});

// 对象类型
const userSchema = schemaObject(
  {
    id: schemaString({ description: "用户唯一 ID" }),
    name: nameSchema,
    email: schemaString({ format: "email", description: "邮箱地址" }),
    role: schemaEnum(["admin", "user", "viewer"], { description: "用户角色" }),
    tags: tagsSchema,
  },
  ["id", "name", "email", "role"],
  { description: "用户对象" },
);

// 引用其他 Schema
const userRef = schemaRef("User");
```

## 路由 Schema 配置（推荐）

在 `@ventostack/core` 的路由中通过第二个参数传入配置对象，OpenAPI 文档将**自动同步生成**，无需手写 Schema。

```typescript
import { createRouter } from "@ventostack/core";

const router = createRouter();

router.post("/api/users", {
  body: {
    name: { type: "string", required: true, min: 2, max: 100, description: "用户姓名" },
    email: { type: "string", required: true, format: "email", description: "邮箱地址" },
    password: { type: "string", required: true, min: 8, description: "密码" },
    role: { type: "string", enum: ["admin", "user", "viewer"], default: "user" },
  },
  responses: {
    201: {
      id: { type: "uuid", description: "用户 ID" },
      name: { type: "string" },
      email: { type: "string", format: "email" },
      role: { type: "string" },
    },
    422: { description: "参数校验失败" },
  },
  openapi: {
    summary: "创建用户",
    tags: ["users"],
    operationId: "createUser",
  },
}, async (ctx) => {
  const user = await createUser(ctx.body);
  return ctx.json({ id: user.id, name: user.name }, 201);
});
```

配置对象支持以下字段：

- `query` — 查询参数 Schema
- `body` — 请求体 Schema
- `headers` — 请求头 Schema
- `formData` — FormData Schema（multipart）
- `responses` — 响应 Schema（按状态码组织）
- `openapi` — OpenAPI 文档元数据（summary、tags 等）

### 支持的 Schema 字段类型

| 类型 | 说明 | OpenAPI 映射 |
|------|------|-------------|
| `string` | 字符串 | `type: "string"` |
| `number` / `float` | 浮点数 | `type: "number"` |
| `int` | 整数 | `type: "integer"` |
| `boolean` / `bool` | 布尔值 | `type: "boolean"` |
| `uuid` | UUID | `type: "string", format: "uuid"` |
| `date` | 日期 | `type: "string", format: "date-time"` |
| `array` | 数组 | `type: "array"` |
| `object` | 对象 | `type: "object"` |
| `file` | 文件上传 | `type: "string", format: "binary"` |

### Schema 字段通用属性

```typescript
{
  type: "string",
  required: true,           // 是否必填
  default: "default_value", // 默认值
  min: 2,                   // 最小值 / 最小长度
  max: 100,                 // 最大值 / 最大长度
  pattern: /^[a-z]+$/,      // 正则匹配
  enum: ["a", "b", "c"],    // 枚举值
  description: "字段描述",   // OpenAPI 描述
  example: "示例值",         // OpenAPI 示例
  format: "email",          // OpenAPI 格式
}
```

### 查询参数自动推断

```typescript
router.get("/api/users", {
  query: {
    page: { type: "int", default: 1, description: "页码" },
    limit: { type: "int", default: 20, description: "每页数量" },
    search: { type: "string", description: "搜索关键词" },
  },
  openapi: {
    summary: "获取用户列表",
    tags: ["users"],
  },
}, async (ctx) => {
  const { page, limit, search } = ctx.query;
  // page → number, limit → number, search → string | undefined
});
```

配置 `query` 后，OpenAPI 会自动生成 `parameters` 定义，无需手动声明。

## 响应类型自动推断

当未配置 `responses` 时，OpenAPI 模块会尝试从 handler 的返回值推断响应类型：

```typescript
// 自动推断为 200 响应，类型为 { message: string }
router.get("/hello", (ctx) => {
  return ctx.json({ message: "Hello!" });
});

// 自动推断为 302 重定向
router.get("/redirect", (ctx) => {
  return ctx.redirect("/target", 302);
});

// 自动推断为 text/plain
router.get("/text", (ctx) => {
  return ctx.text("Plain text response");
});
```

推断优先级：**手动声明 `responses` > 自动推断 > 默认 200**

## Schema 构建器（手动声明）

当需要脱离路由单独构建 Schema 时，使用 Schema 构建函数：

```typescript
import {
  schemaString,
  schemaNumber,
  schemaInteger,
  schemaBoolean,
  schemaArray,
  schemaObject,
  schemaEnum,
  schemaRef,
} from "@ventostack/openapi";

const UserSchema = schemaObject({
  id: schemaString({ format: "uuid", description: "用户 ID" }),
  name: schemaString({ minLength: 2, maxLength: 100, description: "用户姓名" }),
  email: schemaString({ format: "email", description: "邮箱地址" }),
  role: schemaEnum(["admin", "user", "viewer"], { description: "用户角色" }),
  age: schemaInteger({ minimum: 0, maximum: 150 }),
  tags: schemaArray(schemaString(), { description: "标签列表" }),
});
```

### Schema 引用

```typescript
const CreateUserSchema = schemaObject({
  name: schemaString({ minLength: 2 }),
  email: schemaString({ format: "email" }),
  password: schemaString({ minLength: 8 }),
});

// 使用 $ref 引用
const UpdateUserSchema = schemaObject({
  name: schemaString({ minLength: 2 }),
  email: schemaString({ format: "email" }),
});
```

## 路由元数据（手动增强）

使用 `defineRouteDoc` 为路由定义完整的 OpenAPI 元数据：

```typescript
import { defineRouteDoc } from "@ventostack/openapi";

const listUsersDoc = defineRouteDoc({
  path: "/api/users",
  method: "get",
  summary: "获取用户列表",
  description: "支持分页和搜索的用户列表查询",
  tags: ["users"],
  operationId: "listUsers",
  parameters: [
    {
      name: "page",
      in: "query",
      schema: schemaInteger({ default: 1 }),
    },
    {
      name: "limit",
      in: "query",
      schema: schemaInteger({ default: 20, maximum: 100 }),
    },
  ],
  responses: {
    "200": {
      description: "成功返回用户列表",
      content: {
        "application/json": {
          schema: schemaObject({
            data: schemaArray(schemaRef("User")),
            total: schemaInteger(),
          }),
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
});

// 生成文档对象
const doc = generator.generate();
// doc.openapi === "3.0.3"

// 导出为 JSON
const json = generator.toJSON();

// 导出为 YAML
const yaml = generator.toYAML();
```

## 路由到生成器同步

使用 `routesToOpenAPI` 将路由元数据批量注入生成器：

```typescript
import { createOpenAPIGenerator, routesToOpenAPI } from "@ventostack/openapi";

const generator = createOpenAPIGenerator();
generator.setInfo({ title: "My API", version: "1.0.0" });

// 批量注入路由元数据
routesToOpenAPI([listUsersDoc, getUserDoc, createUserDoc], generator);

const spec = generator.generate();
```

## 从 Router 自动同步

将已注册的路由自动同步到生成器（`setupOpenAPI` 内部使用）：

```typescript
import { syncRouterToOpenAPI } from "@ventostack/openapi";

const generator = createOpenAPIGenerator();
generator.setInfo({ title: "My API", version: "1.0.0" });

// 自动读取 router 中所有路由的 schema 配置和 openapi 元数据
syncRouterToOpenAPI(router, generator, {
  excludePaths: ["/health", "/metrics"],  // 排除内部端点
});

const spec = generator.generate();
```

## 自定义文档 UI

默认使用 Scalar UI。如需切换为 Swagger UI：

```typescript
import { createSwaggerUIPlugin, setupOpenAPI } from "@ventostack/openapi";

// 方式 1：单独注册 Swagger UI 插件
app.use(createSwaggerUIPlugin({
  specUrl: "/openapi.json",
  title: "Swagger UI",
  path: "/swagger",
}));

// 方式 2：完全手动控制
generator.addPath("/docs", "get", {
  summary: "API 文档",
  responses: {
    200: { description: "HTML 页面" },
  },
});

// 然后自己注册 handler
app.router.get("/docs", createSwaggerUIHandler({ specUrl: "/openapi.json" }));
```

## 安全注意事项

- `/openapi.json` 和 `/docs` 默认公开暴露，生产环境应通过 `excludePaths` 或环境变量控制访问范围
- `securitySchemes` 中配置的认证方案仅作文档说明，实际认证仍需在路由中实现
- 避免在 `description` 中泄露内部实现细节（如数据库表名、内部 IP）

## 接口定义

```typescript
/** OpenAPI 3.0 Schema 对象 */
interface OpenAPISchema {
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: string[];
  items?: OpenAPISchema;
  enum?: unknown[];
  description?: string;
  example?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  nullable?: boolean;
  oneOf?: OpenAPISchema[];
  allOf?: OpenAPISchema[];
  $ref?: string;
}

/** OpenAPI 文档生成器 */
interface OpenAPIGenerator {
  setInfo(info: OpenAPIInfo): void;
  addServer(server: OpenAPIServer): void;
  addTag(name: string, description?: string): void;
  addSchema(name: string, schema: OpenAPISchema): void;
  addSecurityScheme(name: string, scheme: unknown): void;
  addPath(path: string, method: string, operation: OpenAPIOperation): void;
  generate(): OpenAPIDocument;
  toJSON(): string;
  toYAML(): string;
}

/** OpenAPI 3.0 完整文档 */
interface OpenAPIDocument {
  openapi: "3.0.3";
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  paths: Record<string, OpenAPIPath>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, unknown>;
  };
  tags?: OpenAPITag[];
}
```
```
