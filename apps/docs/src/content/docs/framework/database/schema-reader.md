---
order: 9
title: Schema 读取
description: 使用 readTableSchema 和 listTables 在运行时读取数据库表结构
---

`readTableSchema` 和 `listTables` 提供运行时 Schema 内省能力，可读取表的列、主键、索引等信息。基于 PostgreSQL `information_schema` 查询，索引读取为 best-effort。

## 基本用法

```typescript
import { listTables, readTableSchema } from "@ventostack/database";

// 列出所有用户表
const tables = await listTables(executor);
// ["users", "posts", "comments"]

// 读取表结构
const schema = await readTableSchema(executor, "users");
console.log(schema.columns);  // 列信息数组
console.log(schema.indexes);  // 索引信息数组
```

## 返回结构

### TableSchemaInfo

| 字段 | 类型 | 说明 |
|------|------|------|
| `tableName` | `string` | 表名 |
| `columns` | `ColumnSchemaInfo[]` | 列信息数组 |
| `indexes` | `IndexSchemaInfo[]` | 索引信息数组 |

### ColumnSchemaInfo

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 列名 |
| `type` | `string` | 数据类型 |
| `nullable` | `boolean` | 是否可空 |
| `defaultValue` | `unknown` | 默认值 |
| `isPrimary` | `boolean` | 是否为主键 |
| `comment` | `string?` | 列注释 |

### IndexSchemaInfo

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 索引名称 |
| `columns` | `string[]` | 索引包含的列 |
| `unique` | `boolean` | 是否唯一索引 |

## 函数签名

| 函数 | 说明 |
|------|------|
| `listTables(executor)` | 列出 `public` schema 下所有用户表 |
| `readTableSchema(executor, tableName)` | 读取指定表的列、主键和索引信息 |

> **注意**：表名参数会进行正则校验（仅允许字母、数字、下划线，且以字母或下划线开头），防止 SQL 注入。
