---
order: 2
title: 请求验证与 API 版本管理
description: 使用验证中间件进行请求校验，以及 API 版本控制、废弃管理和文档 Diff 检测
---

请求验证功能由 `@ventostack/core` 提供，而非 `@ventostack/openapi`。它基于简单的字段规则（FieldRule）进行类型检查和约束验证。

## validate 函数

`validate(data, schema)` 校验任意对象是否符合定义的规则，返回 `{ valid: boolean; errors: string[] }`：

```typescript
import { validate } from "@ventostack/core";

const result = validate(
  { name: "Alice", email: "alice@example.com", age: 25 },
  {
    name: { type: "string", required: true, min: 2, max: 100 },
    email: { type: "string", required: true },
    age: { type: "number", min: 0, max: 150 },
    role: { type: "string", enum: ["admin", "user"] as const },
  },
);

if (!result.valid) {
  console.error(result.errors);
  // ["age must be at most 150", "role must be one of: admin, user"]
}
```

## 校验中间件

### validateBody

`validateBody(schema)` 创建校验请求体的中间件，自动解析 JSON 并校验：

```typescript
import { validateBody } from "@ventostack/core";

const createUserSchema = {
  name: { type: "string", required: true, min: 2, max: 100 },
  email: { type: "string", required: true },
  password: { type: "string", required: true, min: 8 },
};

router.post("/users", async (ctx) => {
  const body = await ctx.request.json() as { name: string; email: string; password: string };
  // 校验通过，继续处理
  const user = await createUser(body);
  return ctx.json(user, 201);
}, validateBody(createUserSchema));
```

校验失败时自动返回 `400` 响应：

```json
{
  "errors": [
    "name is required",
    "password must have at least 8 characters"
  ]
}
```

### validateQuery

`validateQuery(schema)` 创建校验查询参数的中间件：

```typescript
import { validateQuery } from "@ventostack/core";

const listQuerySchema = {
  page: { type: "string", pattern: /^[0-9]+$/ },
  limit: { type: "string", pattern: /^[0-9]+$/ },
  search: { type: "string", max: 100 },
};

router.get("/users", async (ctx) => {
  const { page = "1", limit = "20", search } = ctx.query;
  // 已验证的参数
  return ctx.json({ page, limit, search });
}, validateQuery(listQuerySchema));
```

## 字段规则

```typescript
/** 字段类型 */
type FieldType = "string" | "number" | "boolean" | "array" | "object";

/** 字段校验规则 */
interface FieldRule {
  /** 字段类型 */
  type: FieldType;
  /** 是否必填 */
  required?: boolean;
  /** 最小值/最小长度 */
  min?: number;
  /** 最大值/最大长度 */
  max?: number;
  /** 正则匹配（仅 string 类型） */
  pattern?: RegExp;
  /** 枚举值 */
  enum?: readonly unknown[];
  /** 数组元素规则 */
  items?: FieldRule;
  /** 对象属性规则 */
  properties?: Record<string, FieldRule>;
  /** 自定义校验函数，返回错误字符串或 null */
  custom?: (value: unknown) => string | null;
}
```

## 校验结果

```typescript
interface ValidationResult {
  /** 是否通过校验 */
  valid: boolean;
  /** 错误信息列表（字符串数组） */
  errors: string[];
}
```

## 嵌套对象校验

支持对嵌套对象和数组进行深度校验：

```typescript
const result = validate(
  {
    user: {
      name: "Alice",
      tags: ["admin", "developer"],
    },
  },
  {
    user: {
      type: "object",
      required: true,
      properties: {
        name: { type: "string", required: true },
        tags: {
          type: "array",
          items: { type: "string", min: 1 },
        },
      },
    },
  },
);
```

## 自定义校验

通过 `custom` 函数实现自定义校验逻辑：

```typescript
const schema = {
  password: {
    type: "string",
    required: true,
    min: 8,
    custom: (value: unknown) => {
      const str = value as string;
      if (!/[A-Z]/.test(str)) return "必须包含至少一个大写字母";
      if (!/[0-9]/.test(str)) return "必须包含至少一个数字";
      return null;
    },
  },
};
```

---

## API 版本管理与废弃策略

`@ventostack/openapi` 提供完整的 API 生命周期管理工具，支持基于 Header 的版本控制、文档版本追踪、变更 Diff 检测和废弃接口管理。

## API 版本管理

使用 `apiVersion` 中间件实现基于 `Accept` header 或 `X-API-Version` header 的 API 版本控制。

### 基本用法

```typescript
import { apiVersion } from "@ventostack/openapi";

const app = createApp({ port: 3000 });

// 注册版本控制中间件（应在路由之前）
app.use(apiVersion({
  defaultVersion: "1",
  supportedVersions: ["1", "2"],
  deprecatedVersions: ["1"],
  vendorPrefix: "myapp",
}));

// 在路由中读取当前版本
app.router.get("/api/users", async (ctx) => {
  const version = ctx.state.apiVersion as string;

  if (version === "2") {
    return ctx.json({ users: await getUsersV2() });
  }

  return ctx.json({ users: await getUsersV1() });
});
```

### 客户端请求方式

**方式一：Accept header（推荐）**

```bash
curl -H "Accept: application/vnd.myapp+json; version=2" \
  http://localhost:3000/api/users
```

**方式二：X-API-Version header**

```bash
curl -H "X-API-Version: 2" \
  http://localhost:3000/api/users
```

**方式三：不传入版本（使用默认值）**

```bash
curl http://localhost:3000/api/users
# 默认使用 version=1
```

### 废弃版本响应

当客户端调用已废弃的版本时，响应会自动添加 `Deprecation` 和 `Sunset` header：

```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: See documentation for migration guide

{ "users": [...] }
```

### 不支持的版本

当客户端请求不支持的版本时，返回 400 错误：

```json
{
  "error": "UNSUPPORTED_VERSION",
  "message": "API version 3 is not supported. Supported: 1, 2"
}
```

## 文档版本管理

使用 `createDocVersionManager` 追踪 OpenAPI 规范的版本演进。

```typescript
import { createDocVersionManager, createOpenAPIGenerator } from "@ventostack/openapi";

const versionManager = createDocVersionManager();

// 每次发布时记录当前文档版本
function recordVersion(version: string, generator: OpenAPIGenerator) {
  const spec = generator.generate();
  versionManager.addVersion(version, spec as Record<string, unknown>, `Release ${version}`);
}

// 发布 v1.0.0
recordVersion("1.0.0", generator);

// 后续迭代后发布 v1.1.0
recordVersion("1.1.0", generator);
```

### 查询历史版本

```typescript
// 获取指定版本
const v1 = versionManager.getVersion("1.0.0");
console.log(v1?.date);        // "2024-01-15T10:00:00.000Z"
console.log(v1?.description); // "Release 1.0.0"

// 获取最新版本
const latest = versionManager.getLatest();

// 列出所有版本
const allVersions = versionManager.list();
```

### 版本对比

```typescript
const diff = versionManager.compare("1.0.0", "1.1.0");

if (diff) {
  console.log("新增接口:", diff.added);
  console.log("移除接口:", diff.removed);
  console.log("修改接口:", diff.modified);
}
```

## API 变更 Diff

使用 `computeAPIDiff` 和 `generateDiffReport` 检测两个 OpenAPI 规范之间的变更。

### 检测破坏性变更

```typescript
import { computeAPIDiff, generateDiffReport } from "@ventostack/openapi";

const oldSpec = JSON.parse(await Bun.file("openapi-v1.json").text());
const newSpec = generator.generate();

const diff = computeAPIDiff(oldSpec, newSpec);

if (diff.hasBreaking) {
  console.error("检测到破坏性变更！");
}

console.log(`新增: ${diff.summary.added}`);
console.log(`移除: ${diff.summary.removed}`);
console.log(`修改: ${diff.summary.modified}`);
console.log(`废弃: ${diff.summary.deprecated}`);
```

### 生成 Diff 报告

```typescript
const report = generateDiffReport(diff);
await Bun.write("api-diff-report.md", report);
```

报告示例：

```markdown
# API Diff Report

⚠️ **Breaking changes detected!**

## Summary
- Added: 2
- Removed: 0
- Modified: 1
- Deprecated: 1

## Changes

| Type | Method | Path | Breaking | Description |
|------|--------|------|----------|-------------|
| added | POST | /api/v2/users | No | 创建用户V2 |
| modified | GET | /api/users | ⚠️ Yes | 获取用户列表 |
| deprecated | GET | /api/v1/users | No | 获取用户列表V1 |
```

### Diff 检测规则

- **Added**：新版中存在、旧版中不存在的端点
- **Removed**：旧版中存在、新版中不存在的端点（标记为破坏性变更）
- **Modified**：两端点都存在但定义不同
  - 新增必填参数 → 破坏性变更
  - 200 响应格式变更 → 破坏性变更
- **Deprecated**：旧版未标记废弃、新版标记为废弃

## 废弃接口管理

使用 `createDeprecationManager` 和 `createCompatibilityGuard` 管理接口废弃生命周期。

### 注册废弃接口

```typescript
import { createDeprecationManager } from "@ventostack/openapi";

const deprecation = createDeprecationManager();

// 标记接口废弃
deprecation.deprecate({
  path: "/api/v1/users",
  method: "GET",
  version: "1.5.0",
  sunsetDate: "2024-06-01",
  replacement: "/api/v2/users",
  message: "请迁移到 V2 用户列表接口",
});
```

### 查询废弃状态

```typescript
// 检查接口是否已废弃
const notice = deprecation.isDeprecated("GET", "/api/v1/users");

// 获取 Sunset / Deprecation headers
const headers = deprecation.headers("GET", "/api/v1/users");
// => { Deprecation: "true", Sunset: "...", Link: "</api/v2/users>; rel=\"successor-version\"" }

// 检查是否已过 sunset 日期
if (deprecation.isSunset("GET", "/api/v1/users")) {
  console.log("接口已下线");
}

// 生成废弃报告
const report = deprecation.report();
```

### 兼容性守卫

在请求处理层强制执行兼容性策略：

```typescript
import { createDeprecationManager, createCompatibilityGuard } from "@ventostack/openapi";

const deprecation = createDeprecationManager();
deprecation.deprecate({
  path: "/api/legacy/orders",
  method: "POST",
  version: "2.0.0",
  sunsetDate: "2024-03-01",
});

const guard = createCompatibilityGuard(deprecation, {
  versionWindow: 2,
  sunsetDays: 90,
  enforceHeaders: true,
  blockAfterSunset: true,  // sunset 后拒绝请求
});

// 在路由中使用
app.router.post("/api/legacy/orders", async (ctx) => {
  const result = guard.check("POST", "/api/legacy/orders");

  if (!result.allowed) {
    return ctx.json({
      error: "API_SUNSET",
      message: result.warning,
    }, 410);
  }

  // 处理请求...
});
```

### 默认兼容性策略

```typescript
import { DEFAULT_COMPATIBILITY_POLICY } from "@ventostack/openapi";

console.log(DEFAULT_COMPATIBILITY_POLICY);
// {
//   versionWindow: 2,      // 保留最近 2 个版本
//   sunsetDays: 90,        // 废弃后保留 90 天
//   enforceHeaders: true,  // 强制返回废弃 headers
//   blockAfterSunset: false // sunset 后不阻断请求
// }
```

## 最佳实践

1. **版本控制**：新版本接口使用独立路径（如 `/api/v2/users`）或 Header 版本控制，避免混合路由
2. **废弃流程**：
   - 先发布替代接口
   - 标记旧接口为 deprecated（在 OpenAPI 元数据中设置 `deprecated: true`）
   - 在废弃管理器中注册，设置合理的 `sunsetDate`
   - 通过 `Deprecation` header 通知客户端
   - 到达 sunset 日期后，可选择阻断或完全移除
3. **Diff 检查**：在 CI 中运行 `computeAPIDiff`，禁止未经审批的破坏性变更合并到主分支
4. **文档版本**：每次发布时调用 `addVersion` 保存 OpenAPI 快照，便于后续追溯和回滚
