---
order: 8
title: 模型关联
description: 使用 defineRelation、buildJoinSQL、buildEagerLoadSQL 定义和查询模型关联关系
---

提供 `hasOne`、`hasMany`、`belongsTo`、`belongsToMany` 四种关联类型定义，并可自动生成 JOIN SQL 与预加载查询。

## 基本用法

```typescript
import { defineRelation, buildJoinSQL, buildEagerLoadSQL } from "@ventostack/database";
import { UserModel, PostModel } from "./models";

// 一对多：用户 → 文章
const userPosts = defineRelation("hasMany", PostModel, {
  foreignKey: "user_id",
  localKey: "id",
});

// 多对一：文章 → 用户
const postAuthor = defineRelation("belongsTo", UserModel, {
  foreignKey: "user_id",
  localKey: "id",
});

// 多对多：用户 ↔ 角色
const userRoles = defineRelation("belongsToMany", RoleModel, {
  foreignKey: "id",
  localKey: "id",
  pivotTable: "user_roles",
  pivotForeignKey: "user_id",
  pivotRelatedKey: "role_id",
});
```

## 生成 JOIN SQL

```typescript
const joinSQL = buildJoinSQL("users", userPosts);
// "LEFT JOIN posts ON posts.user_id = users.id"

const joinSQL2 = buildJoinSQL("posts", postAuthor);
// "LEFT JOIN users ON users.id = posts.user_id"

const joinSQL3 = buildJoinSQL("users", userRoles, "r");
// "LEFT JOIN user_roles ON user_roles.user_id = users.id LEFT JOIN roles AS r AS r ON r.id = user_roles.role_id"
```

## 预加载查询

```typescript
const { text, params } = buildEagerLoadSQL("users", userPosts, [1, 2, 3]);
// text:   "SELECT * FROM posts WHERE user_id IN ($1, $2, $3)"
// params: [1, 2, 3]
```

`belongsToMany` 预加载会自动关联中间表，返回关联模型数据及中间表外键用于映射。

## 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | `RelationType` | *必填* | `hasOne` / `hasMany` / `belongsTo` / `belongsToMany` |
| `model` | `ModelDefinition` | *必填* | 关联目标模型 |
| `foreignKey` | `string` | *必填* | 外键字段名 |
| `localKey` | `string` | `"id"` | 当前模型中的关联字段 |
| `pivotTable` | `string` | — | 中间表名（仅 `belongsToMany`，必填） |
| `pivotForeignKey` | `string` | — | 中间表指向当前模型的外键（必填） |
| `pivotRelatedKey` | `string` | — | 中间表指向关联模型的外键（必填） |

## 函数签名

| 函数 | 说明 |
|------|------|
| `defineRelation(type, model, options)` | 定义关联关系，返回 `RelationDefinition` |
| `buildJoinSQL(baseTable, relation, alias?)` | 根据关联定义生成 `LEFT JOIN` SQL 片段 |
| `buildEagerLoadSQL(baseTable, relation, parentIds)` | 生成预加载查询，返回 `{ text, params }` |
