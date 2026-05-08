---
order: 11
title: 数据填充
description: 使用 createSeedRunner 管理和执行种子数据
---

`createSeedRunner` 提供可排序、可按名称筛选的种子数据运行器，适用于初始化测试或演示数据。种子按名称字母序执行。

## 基本用法

```typescript
import { createSeedRunner } from "@ventostack/database";

const runner = createSeedRunner(executor);

// 注册种子
runner.addSeed({
  name: "001-users",
  run: async (exec) => {
    await exec("INSERT INTO users (name, email) VALUES ($1, $2)", ["Alice", "alice@example.com"]);
    await exec("INSERT INTO users (name, email) VALUES ($1, $2)", ["Bob", "bob@example.com"]);
  },
});

runner.addSeed({
  name: "002-posts",
  run: async (exec) => {
    await exec("INSERT INTO posts (title, user_id) VALUES ($1, $2)", ["Hello World", 1]);
  },
});

// 执行所有种子（按名称排序）
const executed = await runner.run();
// ["001-users", "002-posts"]

// 仅执行指定种子
const partial = await runner.run({ only: ["001-users"] });
// ["001-users"]

// 查看已注册种子
runner.list(); // ["001-users", "002-posts"]
```

## Seed 接口

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 种子唯一名称（用于排序和筛选） |
| `run` | `(executor: SqlExecutor) => Promise<void>` | 执行种子填充逻辑 |

## SeedRunner 接口

| 方法 | 说明 |
|------|------|
| `addSeed(seed)` | 注册一个种子 |
| `run(options?)` | 执行种子，返回实际执行的种子名称列表 |
| `list()` | 获取所有已注册种子的名称 |

## 配置选项

| 参数 | 类型 | 说明 |
|------|------|------|
| `executor` | `SqlExecutor` | *必填*，SQL 执行器 |
| `options.only` | `string[]` | 仅运行指定名称的种子（可选） |

> **注意**：种子按 `name` 字母序排序执行，建议使用数字前缀（如 `001-`、`002-`）控制顺序。
