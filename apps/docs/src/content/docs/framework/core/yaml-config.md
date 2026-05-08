---
order: 21
title: YAML 配置
description: 使用 parseYAML、stringifyYAML 和 loadYAMLConfig 解析和加载 YAML 配置文件
---

## 概述

VentoStack 提供轻量级 YAML 配置支持，无需引入第三方库。`parseYAML` 解析 YAML 文本为对象，`stringifyYAML` 将对象序列化为 YAML，`loadYAMLConfig` 从文件加载配置并支持环境变量占位符替换和 Schema 校验。

## 基本用法

```typescript
import { parseYAML, stringifyYAML, loadYAMLConfig } from "@ventostack/core";

// 解析 YAML 字符串
const config = parseYAML(`
server:
  host: localhost
  port: 3000
debug: true
`);

// 序列化为 YAML
const yaml = stringifyYAML({ server: { host: "localhost", port: 3000 } });

// 从文件加载（支持环境变量占位符）
const appConfig = await loadYAMLConfig("./config/app.yaml", schema);
```

## 函数签名

```typescript
/** 解析 YAML 字符串为对象 */
function parseYAML(text: string): Record<string, unknown>;

/** 将对象序列化为 YAML 字符串 */
function stringifyYAML(obj: Record<string, unknown>, indent?: number): string;

/** 从文件加载 YAML 配置 */
async function loadYAMLConfig(filePath: string): Promise<Record<string, unknown>>;

/** 从文件加载 YAML 配置并按 Schema 解析类型 */
async function loadYAMLConfig<T extends ConfigSchema>(
  filePath: string,
  schema: T,
  env?: Record<string, string | undefined>,
): Promise<ConfigValue<T>>;
```

## 环境变量占位符

YAML 文件中可使用 `{ENV_VAR}` 格式的占位符，加载时自动替换为环境变量值：

```yaml
database:
  host: "{DB_HOST}"
  port: "{DB_PORT}"
  url: "postgres://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/mydb"
```

缺失的环境变量会抛出错误，提示变量名和所在路径。

## 注意事项

- `parseYAML` 是轻量级实现，支持基本 key-value、嵌套对象和数组，不支持完整 YAML 规范
- 自动推断类型：`true`/`false` → boolean，纯数字 → number，`null`/`~` → null
- 带引号的字符串（`"..."` 或 `'...'`）保持原值
- 传入 Schema 时会自动挂载 `inspect` 脱敏行为（敏感字段打印为 `***`）
