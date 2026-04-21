---
title: 迁移系统
description: 使用 createMigrator 管理数据库 schema 版本
---

`createMigrator` 提供了完整的数据库迁移管理，支持顺序执行、回滚和迁移状态追踪。

## 定义迁移

```typescript
import { createMigrator } from "@aeron/database";
import type { Migration } from "@aeron/database";

const migrations: Migration[] = [
  {
    version: 1,
    name: "create_users_table",
    up: async (db) => {
      await db.raw(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
    },
    down: async (db) => {
      await db.raw("DROP TABLE IF EXISTS users");
    },
  },
  {
    version: 2,
    name: "create_posts_table",
    up: async (db) => {
      await db.raw(`
        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(500) NOT NULL,
          content TEXT,
          published BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
    },
    down: async (db) => {
      await db.raw("DROP TABLE IF EXISTS posts");
    },
  },
  {
    version: 3,
    name: "add_avatar_to_users",
    up: async (db) => {
      await db.raw("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500)");
    },
    down: async (db) => {
      await db.raw("ALTER TABLE users DROP COLUMN IF EXISTS avatar_url");
    },
  },
];
```

## 运行迁移

```typescript
const db = createQueryBuilder({ url: process.env.DATABASE_URL! });
const migrator = createMigrator(db, migrations);

// 应用所有待执行的迁移
await migrator.up();

// 应用到指定版本
await migrator.up(2);

// 回滚最近一次迁移
await migrator.down();

// 回滚到指定版本
await migrator.down(1);
```

## 查询迁移状态

```typescript
// 获取当前版本
const version = await migrator.currentVersion();
console.log(`当前数据库版本: ${version}`);

// 获取所有迁移状态
const status = await migrator.status();
status.forEach(({ migration, executed, executedAt }) => {
  console.log(`v${migration.version} ${migration.name}: ${executed ? "已执行" : "待执行"}`);
});
```

## 在应用启动时运行

```typescript
const app = createApp({ port: 3000 });

app.onStart(async () => {
  console.log("运行数据库迁移...");
  await migrator.up();
  console.log("数据库迁移完成");
});
```

## Migrator 接口

```typescript
interface Migration {
  version: number;
  name: string;
  up: (db: QueryBuilder) => Promise<void>;
  down: (db: QueryBuilder) => Promise<void>;
}

interface Migrator {
  up(targetVersion?: number): Promise<void>;
  down(targetVersion?: number): Promise<void>;
  currentVersion(): Promise<number>;
  status(): Promise<MigrationStatus[]>;
}
```
