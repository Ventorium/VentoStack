---
order: 6
title: 驱动适配器
description: 使用 createDriverAdapter 抹平 PostgreSQL、MySQL、SQLite、MSSQL 方言差异
---

`createDriverAdapter` 为不同数据库方言提供统一抽象，包括占位符、标识符引用、分页、UPSERT 等差异处理。支持 `postgresql`、`mysql`、`sqlite`、`mssql` 四种驱动。

## 基本用法

```typescript
import { createDriverAdapter } from "@ventostack/database";

const pg = createDriverAdapter("postgresql");

pg.placeholder(1);           // "$1"
pg.quote("users");           // "\"users\""
pg.limitOffset(10, 20);      // "LIMIT 10 OFFSET 20"
pg.returning(["id", "name"]); // "RETURNING id, name"
pg.now();                    // "NOW()"
pg.boolean(true);            // "TRUE"

const mysql = createDriverAdapter("mysql");
mysql.placeholder(1);        // "?"
mysql.quote("users");        // "`users`"
mysql.returning(["id"]);     // "" (MySQL 不支持 RETURNING)
```

## UPSERT 生成

各驱动会自动生成对应的 UPSERT 语法：

```typescript
const pg = createDriverAdapter("postgresql");
pg.upsert("users", ["email", "name", "age"], ["email"]);
// "INSERT INTO users (...) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, age = EXCLUDED.age"

const mysql = createDriverAdapter("mysql");
mysql.upsert("users", ["email", "name", "age"], ["email"]);
// "INSERT INTO users (...) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ..."
```

## 配置选项

| 参数 | 类型 | 说明 |
|------|------|------|
| `driver` | `"postgresql" \| "mysql" \| "sqlite" \| "mssql"` | 数据库驱动类型 |

## DriverAdapter 接口

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `placeholder(index)` | `string` | 生成参数占位符（PG: `$1`, MySQL/SQLite: `?`, MSSQL: `@p1`） |
| `quote(identifier)` | `string` | 引用标识符（表名、列名等） |
| `limitOffset(limit, offset)` | `string` | 生成分页子句 |
| `returning(fields)` | `string` | 生成 RETURNING 子句（MySQL 返回空） |
| `now()` | `string` | 当前时间戳函数 |
| `upsert(table, fields, conflictFields)` | `string` | 生成 UPSERT 语句 |
| `boolean(value)` | `string` | 布尔值字面量 |
