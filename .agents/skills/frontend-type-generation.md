---
name: frontend-type-generation
description: |
  前端类型自动生成规范。目标：从后端 OpenAPI spec 自动生成 schema.ts 和 types.ts，
  消除手写类型和 any，实现前后端类型同步。
---

# Frontend Type Generation — 类型自动生成规范

## 当前问题

- `apps/admin/web/src/api/schema.ts` 大量 `any`（`response: any[]`、`list?: any[]` 等）
- `apps/admin/web/src/api/types.ts` 手写接口（`UserItem`、`RoleItem` 等）
- 前后端类型不同步，维护成本高

## 目标架构

```
Backend (VentoStack)
  ↓ 运行时生成
OpenAPI 3.1 Spec (/openapi.json)
  ↓ 构建时拉取 + 生成
o2t (OpenAPI to TypeScript)
  ↓ 生成
schema.ts  ← 已存在，需消除 any
  ↓ 引用
types.ts   ← 从 schema.ts 提取/导出纯类型
```

## 现有基础设施

- **后端**: `@ventostack/openapi` 已集成，`/openapi.json` 端点已暴露
- **前端**: 使用 `@doremijs/o2t` 客户端，`o2t.config.mjs` 已配置
- **当前配置**:
  ```js
  // apps/admin/web/o2t.config.mjs
  import { defineConfig } from "@doremijs/o2t";
  export default defineConfig({
    specUrl: "http://0.0.0.0:9320/openapi.json",
  });
  ```

## 实施步骤

### Step 1: 确保后端路由有完整的 Schema 定义

后端路由必须使用 `defineRouteConfig` 声明完整的 query/body/response schema：

```typescript
// ✅ 正确: 完整声明
router.get("/api/system/users", defineRouteConfig({
  query: {
    page: { type: "integer", default: 1 },
    pageSize: { type: "integer", default: 10 },
    username: { type: "string", optional: true },
  },
  response: {
    type: "object",
    properties: {
      code: { type: "integer" },
      message: { type: "string" },
      data: {
        type: "object",
        properties: {
          list: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                username: { type: "string" },
                // ... 所有字段
              },
            },
          },
          total: { type: "integer" },
          page: { type: "integer" },
          pageSize: { type: "integer" },
        },
      },
    },
  },
}), handler);
```

### Step 2: 生成 schema.ts

```bash
# 启动后端服务
bun run apps/admin/api/src/index.ts

# 生成 schema.ts（o2t CLI）
cd apps/admin/web
npx o2t generate
```

生成后的 `schema.ts` 应包含：
- 每个路由的 `query` / `params` / `headers` / `body` / `response` 精确类型
- 无 `any`，所有数组元素有具体类型

### Step 3: types.ts 改为从 schema.ts 导出

```typescript
// apps/admin/web/src/api/types.ts
// ✅ 正确: 从 schema.ts 提取类型，不再手写

import type { OpenAPIs } from "./schema";

// 从 schema 中提取具体类型
export type UserItem = OpenAPIs["get"]["/api/system/users"]["response"]["data"]["list"][number];
export type RoleItem = OpenAPIs["get"]["/api/system/roles"]["response"]["data"]["list"][number];
// ... 其他类型

// 保留 hooks 相关类型
export type { PaginatedData, PaginatedParams } from "../hooks/useTable";

// 保留非 API 类型（如表单 body）
export type CreateNoticeBody = OpenAPIs["post"]["/api/system/notices"]["body"];
export type UpdateNoticeBody = OpenAPIs["put"]["/api/system/notices/:id"]["body"];
```

### Step 4: 构建流程集成

在 `apps/admin/web/package.json` 中添加生成脚本：

```json
{
  "scripts": {
    "generate:api": "o2t generate",
    "prebuild": "npm run generate:api",
    "predev": "npm run generate:api"
  }
}
```

## 约束

- ❌ 禁止手写 `XxxItem` 接口
- ❌ 禁止在 schema.ts 中使用 `any`
- ✅ 所有类型从 `OpenAPIs` 提取
- ✅ 后端路由必须声明完整 response schema
- ✅ 生成脚本纳入 CI/CD

## 验收标准

- [ ] `schema.ts` 中 `any` 数量为 0
- [ ] `types.ts` 中无手写接口（除 hooks 相关）
- [ ] `bun run typecheck` 通过
- [ ] 新增后端字段后，重新生成即可同步到前端
