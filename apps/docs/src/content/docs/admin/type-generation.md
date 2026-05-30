---
order: 9
title: 类型自动生成
---

## 现状

当前前端类型存在以下问题：

- `apps/admin/web/src/api/schema.ts` 包含大量 `any`（`response: any[]`、`list?: any[]`）
- `apps/admin/web/src/api/types.ts` 手写接口（`UserItem`、`RoleItem` 等）
- 前后端类型不同步，维护成本高

## 目标

从后端 OpenAPI Spec 自动生成前端类型，消除手写类型和 `any`。

## 技术方案

```
Backend (VentoStack)
  ↓ 运行时生成
OpenAPI 3.1 Spec (/openapi.json)
  ↓ 构建时拉取 + 生成
@doremijs/o2t
  ↓ 生成
schema.ts  ← 已配置，需消除 any
  ↓ 引用
types.ts   ← 从 schema.ts 提取纯类型
```

## 现有基础设施

- 后端 `@ventostack/openapi` 已集成，`/openapi.json` 端点已暴露
- 前端使用 `@doremijs/o2t` 客户端
- 配置文件 `apps/admin/web/o2t.config.mjs`：

```js
import { defineConfig } from "@doremijs/o2t";
export default defineConfig({
  specUrl: "http://0.0.0.0:9320/openapi.json",
});
```

## 实施步骤

### 1. 完善后端路由 Schema 定义

后端路由必须使用 `defineRouteConfig` 声明完整的 response schema：

```typescript
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

### 2. 生成 schema.ts

```bash
# 启动后端服务
bun run apps/admin/api/src/index.ts

# 生成 schema.ts
cd apps/admin/web
npx o2t generate
```

### 3. types.ts 改为从 schema.ts 导出

```typescript
// apps/admin/web/src/api/types.ts
import type { OpenAPIs } from "./schema";

// 从 schema 提取具体类型
export type UserItem = OpenAPIs["get"]["/api/system/users"]["response"]["data"]["list"][number];
export type RoleItem = OpenAPIs["get"]["/api/system/roles"]["response"]["data"]["list"][number];
// ... 其他类型

// 保留 hooks 相关类型
export type { PaginatedData, PaginatedParams } from "../hooks/useTable";
```

### 4. 构建流程集成

在 `apps/admin/web/package.json` 中添加：

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

- 禁止手写 `XxxItem` 接口
- 禁止在 schema.ts 中使用 `any`
- 所有类型从 `OpenAPIs` 提取
- 后端路由必须声明完整 response schema
- 生成脚本纳入 CI/CD

## 验收标准

- [ ] `schema.ts` 中 `any` 数量为 0
- [ ] `types.ts` 中无手写接口（除 hooks 相关）
- [ ] `bun run typecheck` 通过
- [ ] 新增后端字段后，重新生成即可同步到前端
