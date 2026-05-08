---
order: 7
title: 读写分离
description: 使用 createReadWriteSplit 实现读写库路由与负载均衡
---

`createReadWriteSplit` 将写操作路由到主库、读操作路由到从库，支持 `round-robin` 和 `random` 两种负载均衡策略，适用于读多写少的场景。

## 基本用法

```typescript
import { createReadWriteSplit } from "@ventostack/database";

const executor = createReadWriteSplit({
  writer: async (sql, params) => {
    return writePool.query(sql, params);
  },
  readers: [
    async (sql, params) => readPool1.query(sql, params),
    async (sql, params) => readPool2.query(sql, params),
  ],
  strategy: "round-robin",
});

// 显式路由
await executor.write("INSERT INTO users (name) VALUES ($1)", ["Alice"]);
await executor.read("SELECT * FROM users WHERE id = $1", [1]);

// 自动路由 — 根据 SQL 关键字判断读写
await executor.execute("SELECT * FROM users");        // → 读库
await executor.execute("UPDATE users SET age = 20");   // → 写库
```

## 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `writer` | `SqlExecutor` | *必填* | 写库 SQL 执行器 |
| `readers` | `SqlExecutor[]` | *必填* | 读库执行器数组（至少一个） |
| `strategy` | `"round-robin" \| "random"` | `"round-robin"` | 读库负载均衡策略 |

## 自动路由规则

`execute` 方法根据 SQL 起始关键字自动判断路由：

- **写操作**：`INSERT`、`UPDATE`、`DELETE`、`CREATE`、`ALTER`、`DROP`、`TRUNCATE`、`BEGIN`、`COMMIT`、`ROLLBACK`、`SAVEPOINT`
- **读操作**：其余所有 SQL（如 `SELECT`）

## ReadWriteSplitExecutor 接口

| 方法 | 说明 |
|------|------|
| `read(sql, params?)` | 强制路由到读库 |
| `write(sql, params?)` | 强制路由到写库 |
| `execute(sql, params?)` | 自动判断读写并路由 |
| `currentReaderIndex()` | 获取当前读库索引 |
