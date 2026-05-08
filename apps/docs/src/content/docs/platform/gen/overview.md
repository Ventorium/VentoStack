---
title: 代码生成概述
description: '代码生成模块提供从数据库表导入表结构、配置字段属性、预览和生成 CRUD 代码的能力。'
---

## 概述

`@ventostack/gen` 是 VentoStack 平台层的代码生成模块，从数据库表结构自动生成后端 CRUD 代码，包括数据模型、Service、路由、TypeScript 类型和测试文件，减少重复劳动。

## 工作流程

```
数据库表 → 导入表结构 → 配置字段属性 → 预览代码 → 生成代码
```

## 快速开始

### 创建代码生成模块

```typescript
import { createGenModule } from '@ventostack/gen';
import { readTableSchema } from '@ventostack/database';

const genModule = createGenModule({
  db,
  executor,          // @ventostack/database 的原始 SQL 执行器
  readTableSchema,   // 表结构读取函数
  jwt,
  jwtSecret,
  rbac,
});

// 注册路由
app.use(genModule.router);

// 初始化
await genModule.init();
```

### 模块依赖

```typescript
interface GenModuleDeps {
  db: Database;                    // 数据库实例
  executor: SqlExecutor;           // 原始 SQL 执行器，用于读取表结构
  readTableSchema: (executor: SqlExecutor, tableName: string) => Promise<TableSchemaInfo>;
  jwt: JWTManager;                 // JWT 管理器
  jwtSecret: string;               // JWT 密钥
  rbac?: RBAC;                     // 权限控制（可选）
}
```

## API 路由

所有路由需要认证，基于 RBAC 权限控制。

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/gen/tables` | `gen:table:list` | 查询已导入表列表 |
| POST | `/api/gen/tables/import` | `gen:table:create` | 导入数据库表 |
| GET | `/api/gen/tables/:id` | `gen:table:query` | 查询表详情（含列信息） |
| PUT | `/api/gen/tables/:id` | `gen:table:update` | 更新表配置 |
| PUT | `/api/gen/columns/:id` | `gen:table:update` | 更新列配置 |
| GET | `/api/gen/tables/:id/preview` | `gen:table:query` | 预览生成代码 |
| POST | `/api/gen/tables/:id/generate` | `gen:table:generate` | 生成代码 |

### 查询已导入表

```typescript
GET /api/gen/tables?page=1&pageSize=10
```

### 导入表

```typescript
POST /api/gen/tables/import
{
  "tableName": "biz_order",        // 数据库表名
  "moduleName": "order",           // 模块名
  "author": "admin"                // 可选，作者
}

// 响应
{ "tableId": "uuid" }
// 导入后自动解析：列名、类型、注释、主键、是否可空
// 并自动映射 SQL 类型到 TypeScript 类型
```

### 更新表配置

```typescript
PUT /api/gen/tables/:id
{
  "className": "Order",            // 类名
  "moduleName": "order",           // 模块名
  "functionName": "订单管理",        // 功能名称
  "functionAuthor": "admin",       // 作者
  "remark": "订单相关功能"           // 备注
}
```

### 更新列配置

```typescript
PUT /api/gen/columns/:id
{
  "isList": true,                  // 是否在列表中显示
  "isInsert": true,                // 是否在新增中显示
  "isUpdate": true,                // 是否在编辑中显示
  "isQuery": true,                 // 是否作为查询条件
  "queryType": "like",             // 查询方式（如 eq、like、between 等）
  "fieldComment": "订单编号"        // 字段注释
}
```

### 预览生成代码

```typescript
GET /api/gen/tables/:id/preview

// 响应
[
  { "filename": "models/biz-order.ts", "content": "..." },
  { "filename": "services/biz-order.ts", "content": "..." },
  { "filename": "routes/biz-order.ts", "content": "..." },
  { "filename": "types/biz-order.ts", "content": "..." },
  { "filename": "__tests__/biz-order.test.ts", "content": "..." }
]
```

### 生成代码

```typescript
POST /api/gen/tables/:id/generate

// 响应与预览相同，返回生成的文件列表
```

## 服务接口

通过 `genModule.services.gen` 访问服务：

```typescript
const svc = genModule.services.gen;

// 导入表
const { tableId } = await svc.importTable('biz_order', 'order', 'admin');

// 查询已导入表列表
const tables = await svc.listTables({ page: 1, pageSize: 10 });

// 查询表详情
const table = await svc.getTable(tableId);

// 查询列信息
const columns = await svc.getColumns(tableId);

// 更新表配置
await svc.updateTable(tableId, {
  functionName: '订单管理',
  moduleName: 'order',
});

// 更新列配置
await svc.updateColumn(columns[0].id, {
  isQuery: true,
  queryType: 'like',
});

// 预览生成代码
const files = await svc.preview(tableId);

// 生成代码
const generated = await svc.generate(tableId);
```

## 生成文件结构

生成的代码包含 5 个文件：

```
models/{kebab-case-name}.ts       // @ventostack/database 数据模型定义
services/{kebab-case-name}.ts     // CRUD 服务函数
routes/{kebab-case-name}.ts       // HTTP 路由处理器
types/{kebab-case-name}.ts        // TypeScript 类型定义
__tests__/{kebab-case-name}.test.ts  // 测试文件
```

## SQL 类型映射

导入表时自动将 SQL 类型映射为 TypeScript 类型：

| SQL 类型 | TypeScript 类型 |
|----------|----------------|
| varchar, text, char | `string` |
| int, serial, bigint, smallint, float, double, numeric, decimal | `number` |
| boolean | `boolean` |
| timestamp, date, time | `string` |
| json, jsonb | `Record<string, unknown>` |
| 其他 | `unknown` |

## 生成代码规范

生成的代码遵循以下规范：

- 函数式风格，不使用 class
- 显式依赖注入
- 使用 `@ventostack/database` 的模型定义和查询 API
- 完整的 TypeScript 类型定义
- 路由注册使用 `@ventostack/core` 的路由 API
- 自动将 `snake_case` 列名转换为 `camelCase` 字段名
