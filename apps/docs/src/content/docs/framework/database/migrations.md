---
order: 4
title: 迁移系统
description: 使用 createMigrationRunner 管理数据库 schema 变更
---

`createMigrationRunner` 提供了版本化数据库结构变更能力，支持顺序执行、回滚和迁移状态追踪。迁移记录持久化于 `__migrations` 表。

## 定义迁移

```typescript
import { createMigrationRunner } from "@ventostack/database";
import type { Migration } from "@ventostack/database";

const migrations: Migration[] = [
  {
    name: "001_create_users_table",
    up: async (exec) => {
      await exec(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
    },
    down: async (exec) => {
      await exec("DROP TABLE IF EXISTS users");
    },
  },
  {
    name: "002_create_posts_table",
    up: async (exec) => {
      await exec(`
        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(500) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
    },
    down: async (exec) => {
      await exec("DROP TABLE IF EXISTS posts");
    },
  },
];
```

## 运行迁移

```typescript
// 创建迁移运行器
const runner = createMigrationRunner(db.raw);

// 注册迁移
for (const m of migrations) {
  runner.addMigration(m);
}

// 应用所有待执行的迁移
const executed = await runner.up();
console.log("已执行迁移:", executed);

// 回滚最近 1 个迁移
const rolledBack = await runner.down();
console.log("已回滚迁移:", rolledBack);

// 回滚最近 3 个迁移
await runner.down(3);
```

## 查询迁移状态

```typescript
const status = await runner.status();
status.forEach(({ name, executedAt }) => {
  console.log(`${name}: ${executedAt ? "已执行" : "待执行"}`);
});
```

## 在应用启动时运行

`VentoStackApp` 通过 `app.lifecycle` 暴露生命周期钩子，使用 `onBeforeStart` 在应用开始监听前运行迁移：

```typescript
const app = createApp({ port: 3000 });

app.lifecycle.onBeforeStart(async () => {
  const runner = createMigrationRunner(db.raw);
  for (const m of migrations) {
    runner.addMigration(m);
  }
  const executed = await runner.up();
  console.log("数据库迁移完成", executed);
});
```

## MigrationRunner 接口

```typescript
interface Migration {
  name: string;
  up: (executor: (text: string, params?: unknown[]) => Promise<unknown>) => Promise<void>;
  down: (executor: (text: string, params?: unknown[]) => Promise<unknown>) => Promise<void>;
}

interface MigrationStatus {
  name: string;
  executedAt: Date | null;
}

interface MigrationRunner {
  addMigration(migration: Migration): void;
  up(): Promise<string[]>;
  down(steps?: number): Promise<string[]>;
  status(): Promise<MigrationStatus[]>;
}
```

## 注意事项

- 迁移名称 `name` 是唯一标识，建议使用时间戳或序号前缀（如 `001_`、`20240101_`）保证顺序。
- `up()` 按名称升序执行所有未执行的迁移。
- `down(steps)` 按名称倒序回滚最近 `steps` 个已执行迁移，默认回滚 1 个。
- 迁移执行器 `exec` 接收 SQL 字符串和可选的参数数组，与 `db.raw` 签名一致。
- `__migrations` 表自动创建，无需手动维护。
- 重复注册相同 `name` 的迁移会抛出错误。

:::caution
每个迁移在 `up()` 和 `down()` 内部都运行在独立的数据库事务中（`BEGIN / COMMIT / ROLLBACK`）。如果某个迁移失败，该迁移内的所有变更会自动回滚，且迁移记录不会被写入或删除。
:::
