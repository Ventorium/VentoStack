---
order: 24
title: 12-Factor 配置
description: 使用 loadTwelveFactorConfig 从环境变量加载标准化应用配置，遵循 12-Factor App 规范
---

## 概述

`loadTwelveFactorConfig` 遵循 12-Factor App 规范，从环境变量中加载标准化应用配置。同时提供 `validateEnvVars` 工具函数用于校验必要的环境变量是否已设置。

## 基本用法

```typescript
import { loadTwelveFactorConfig, validateEnvVars } from "@ventostack/core";

// 加载标准配置
const { config, warnings } = loadTwelveFactorConfig();
console.log(config.port);    // 3000
console.log(config.env);     // "development"

// 校验必需的环境变量
const { valid, missing } = validateEnvVars(["DATABASE_URL", "JWT_SECRET"]);
if (!valid) {
  console.error("缺少环境变量:", missing);
}
```

## 函数签名

```typescript
interface TwelveFactorConfig {
  appName: string;
  port: number;
  env: string;
  logLevel: string;
  databaseUrl?: string;
  redisUrl?: string;
  extra: Record<string, string>;
}

function loadTwelveFactorConfig(
  env?: Record<string, string | undefined>,
): { config: TwelveFactorConfig; warnings: string[] };

function validateEnvVars(
  required: string[],
  env?: Record<string, string | undefined>,
): { valid: boolean; missing: string[] };
```

## 读取的环境变量

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `APP_NAME` | 应用名称 | `"ventostack-app"` |
| `PORT` | 监听端口 | `3000` |
| `NODE_ENV` / `BUN_ENV` | 运行环境 | `"development"` |
| `LOG_LEVEL` | 日志级别 | `"info"` |
| `DATABASE_URL` | 数据库连接地址 | — |
| `REDIS_URL` | Redis 连接地址 | — |
| `APP_*` | `APP_` 前缀的变量 | 收集到 `extra` |

## 注意事项

- `PORT` 非有效数字时回退到 `3000`，并添加警告
- 生产环境未设置 `DATABASE_URL` 时会添加警告
- `extra` 收集所有 `APP_` 前缀的环境变量，便于扩展自定义配置
- 函数不抛出异常，所有问题通过 `warnings` 数组报告
- 可传入自定义 `env` 对象用于测试
