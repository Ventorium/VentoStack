---
name: framework-database
description: |
  开发或修改 @ventostack/database 框架层代码时必须遵循的规范。
  涵盖模型定义、查询构建器、迁移、事务、连接池的实现约定。
---

# Framework Database — AI Agent 编码规范

## 核心原则

1. **Bun.sql 标签模板**: 唯一正确的 SQL 调用方式是 `` sql`...` ``，禁止 `.query()` 风格。
2. **零运行时反射**: 模型类型在编译期推导，禁止 `Reflect` 或装饰器。
3. **参数化查询**: 所有动态值必须用参数占位符 `$1, $2`，禁止字符串拼接。
4. **函数式模型**: 无 class ORM，用 `defineModel` + `column` 工厂函数。

## 模型定义

```typescript
// ✅ 正确
import { defineModel, column } from "@ventostack/database";

export const UserModel = defineModel("sys_user", {
  id: column.string({ primaryKey: true }),
  username: column.string({ maxLength: 64, nullable: false }),
  email: column.string({ maxLength: 128, nullable: true }),
  status: column.integer({ default: 1 }),
  deletedAt: column.timestamp({ nullable: true, softDelete: true }),
  createdAt: column.timestamp({ default: "now" }),
});

// ❌ 禁止: class + 装饰器
@Entity()
class User {
  @PrimaryKey()
  id: string;
}
```

## 查询构建器

### 链式 API 约束

```typescript
// ✅ 正确
const users = await db.query(UserModel)
  .select("id", "username")
  .where("status", "=", 1)
  .where("deleted_at", "IS", null)   // 注意: IS NULL 不能参数化
  .orderBy("created_at", "desc")
  .limit(20)
  .offset(0)
  .execute();

// ❌ 禁止: 字符串拼接 WHERE
.where(`status = ${status}`)
```

### IS NULL 特殊处理

```typescript
// ✅ 正确: 已修复的 IS NULL 生成
.where("age", "IS", null)  // 生成: age IS NULL（不是 IS $1）
```

## 迁移（Migration）

### 迁移文件模板

```typescript
import type { Migration } from "@ventostack/database";

export const createSysXxx: Migration = {
  name: "NNN_create_sys_xxx",

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_xxx (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        sort INT NOT NULL DEFAULT 0,
        status INT NOT NULL DEFAULT 1,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },

  async down(executor) {
    await executor(`DROP TABLE IF EXISTS sys_xxx`);
  },
};
```

### 迁移约束

- 文件名: `NNN_description.ts`，数字递增
- 表名: `sys_` 前缀（平台层）或应用前缀
- 必须有 `id`、软删除字段 `deleted_at`、时间戳字段
- `down()` 必须能完整回滚
- 使用 `IF NOT EXISTS` / `IF EXISTS` 保证幂等

## 事务

```typescript
// ✅ 正确
await db.transaction(async (tx) => {
  const userId = await tx.query(UserModel).insert({ username: "foo" });
  await tx.query(ProfileModel).insert({ userId });
});

// ❌ 禁止: 手动 BEGIN / COMMIT / ROLLBACK
```

## Schema 读取

```typescript
// ✅ 正确: 使用框架提供的 schema-reader
import { readTableSchema, listTables } from "@ventostack/database";

const schema = await readTableSchema(executor, "sys_user");
const tables = await listTables(executor);
```

### 安全约束

- `readTableSchema` 内部有表名正则校验，防止 SQL 注入
- 禁止直接 `executor("SELECT * FROM " + tableName)`

## 关联关系

```typescript
// ✅ 正确
import { defineRelation } from "@ventostack/database";

export const UserPostsRelation = defineRelation("hasMany", PostModel, {
  foreignKey: "userId",
});
```

支持的关联类型: `hasOne | hasMany | belongsTo | belongsToMany`

## 测试

- 使用 `createMockDatabase(mockExec)` 创建 mock db
- SQL 模式匹配支持精确匹配 + 表名模糊匹配
- 测试文件: `__tests__/xxx.test.ts`

## 禁止事项

- ❌ 引入 TypeORM / Prisma / Sequelize
- ❌ 使用 class + 装饰器定义模型
- ❌ 字符串拼接 SQL
- ❌ 运行时反射获取列类型
- ❌ 在迁移中执行业务逻辑
