---
order: 10
title: Schema 差异检测
description: 使用 diffSchemas 和 generateMigrationSQL 比对 Schema 并生成迁移 SQL
---

`diffSchemas` 对比当前数据库 Schema 与目标 Schema，检测表和列的增删改差异。`generateMigrationSQL` 根据差异生成 up / down 双向迁移 SQL。

## 基本用法

```typescript
import { diffSchemas, generateMigrationSQL } from "@ventostack/database";

const current = [
  {
    name: "users",
    columns: [
      { name: "id", type: "bigint", primaryKey: true },
      { name: "name", type: "varchar", nullable: false },
    ],
  },
];

const target = [
  {
    name: "users",
    columns: [
      { name: "id", type: "bigint", primaryKey: true },
      { name: "name", type: "varchar", nullable: false },
      { name: "email", type: "varchar", nullable: true },
    ],
  },
  {
    name: "posts",
    columns: [
      { name: "id", type: "bigint", primaryKey: true },
      { name: "title", type: "varchar" },
    ],
  },
];

const diff = diffSchemas(current, target);
// diff.addedTables    → ["posts"]
// diff.modifiedTables → [{ table: "users", addedColumns: [...], ... }]

const { up, down } = generateMigrationSQL(diff);
// up:  正向迁移 SQL
// down: 回滚 SQL
```

## 差异结构

### SchemaDiff

| 字段 | 类型 | 说明 |
|------|------|------|
| `addedTables` | `string[]` | 新增表名列表 |
| `removedTables` | `string[]` | 移除表名列表 |
| `modifiedTables` | `TableDiff[]` | 发生变更的表差异列表 |

### TableDiff

| 字段 | 类型 | 说明 |
|------|------|------|
| `table` | `string` | 表名 |
| `addedColumns` | `ColumnSchema[]` | 新增列 |
| `removedColumns` | `string[]` | 移除的列名 |
| `modifiedColumns` | `ColumnDiff[]` | 变更的列差异 |

### ColumnDiff

| 字段 | 类型 | 说明 |
|------|------|------|
| `column` | `string` | 列名 |
| `changes` | `string[]` | 变更项（`type`、`nullable`、`default`） |
| `from` / `to` | `Partial<ColumnSchema>` | 变更前后的值 |

## 函数签名

| 函数 | 说明 |
|------|------|
| `diffSchemas(current, target)` | 对比两个 Schema，返回 `SchemaDiff` |
| `generateMigrationSQL(diff)` | 生成 `{ up, down }` 迁移 SQL 数组 |
