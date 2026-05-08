---
order: 7
title: 配置管理
description: 使用 createConfig 和 loadConfig 管理应用配置，支持环境变量、JSON 文件和 12-Factor 规范
---

VentoStack 提供了多种配置管理方式，从简单的环境变量读取到完整的 12-Factor 配置系统。

## 基本配置

使用 `createConfig` 定义 schema 并读取配置：

```typescript
import { createConfig } from "@ventostack/core";

const config = createConfig({
  port: { type: "number", env: "PORT", default: 3000 },
  host: { type: "string", env: "HOST", default: "0.0.0.0" },
  logLevel: { type: "string", env: "LOG_LEVEL", default: "info" },
  databaseUrl: { type: "string", env: "DATABASE_URL", required: true },
  jwtSecret: { type: "string", env: "JWT_SECRET", required: true, sensitive: true },
  debug: { type: "boolean", env: "DEBUG", default: false },
}, process.env);

// TypeScript 自动推断类型
config.port     // number
config.host     // string
config.debug    // boolean
```

### 枚举约束（options）

使用 `options` 限定字段的允许取值，TypeScript 会自动推导出 **union 类型**：

```typescript
const config = createConfig({
  logLevel: {
    type: "string",
    env: "LOG_LEVEL",
    default: "info",
    options: ["debug", "info", "warn", "error"],
  },
  mode: {
    type: "number",
    options: [1, 2, 3],
  },
}, process.env);

// 类型自动推导为字面量 union
config.logLevel // "debug" | "info" | "warn" | "error"
config.mode     // 1 | 2 | 3 | undefined
```

运行时若传入的值不在 `options` 范围内，会立即抛出错误：

```
Config "logLevel": value "verbose" is not in allowed options [debug, info, warn, error]
```

## 支持的字段类型

```typescript
type ConfigFieldDef = {
  type: "string" | "number" | "boolean";
  env?: string;              // 环境变量名
  default?: string | number | boolean; // 默认值（类型必须与 type 一致）
  required?: boolean;        // 是否必填（无默认值时）
  sensitive?: boolean;       // 敏感字段（日志中脱敏）
  secret?: boolean;          // 是否为密钥（需加密存储）
  options?: readonly string[] | readonly number[] | readonly boolean[]; // 允许取值范围
};
```

**类型推导规则：**
- 设置了 `default` 或 `required: true` 的字段，类型中**不含** `undefined`
- 未设置 `default` 且 `required` 为 `false` 的字段，类型中**包含** `undefined`
- 设置了 `options` 的字段，类型自动推导为 `options` 的 **union 类型**（如 `"debug" | "info" | "error"`）

## 嵌套 Schema

Schema 支持嵌套结构：

```typescript
const config = createConfig({
  server: {
    port: { type: "number", default: 3000 },
    host: { type: "string", default: "0.0.0.0" },
  },
  database: {
    url: { type: "string", required: true },
    pool: { type: "number", default: 10 },
  },
}, process.env);

// config.server.port → number
// config.database.url → string
```

## 分环境配置文件

`loadConfig` 支持从 JSON 文件加载配置，并按环境合并：

```typescript
import { loadConfig } from "@ventostack/core";

// 读取 config/base.json 和 config/${NODE_ENV}.json
const config = await loadConfig(
  {
    port: { type: "number", default: 3000 },
    databaseUrl: { type: "string", required: true },
  },
  {
    basePath: "./config",  // 配置文件目录
    env: "development",    // 当前环境名
  }
);
```

配置文件结构：
```
config/
  base.json          - 基础配置
  development.json   - 开发环境覆盖
  production.json    - 生产环境覆盖
  test.json          - 测试环境覆盖
```

## YAML 配置文件

`loadYAMLConfig` 支持 `schema` 和环境变量占位符，推荐把它当成 YAML 版的 `loadConfig` 使用。

```typescript
import { loadYAMLConfig, parseYAML } from "@ventostack/core";

const schema = {
  server: {
    host: { type: "string", required: true },
    port: { type: "number", required: true },
  },
  database: {
    url: { type: "string", required: true },
    pool: { type: "number", default: 10 },
  },
} as const;

// 从文件加载并做 schema 校验
const config = await loadYAMLConfig("./config/app.yaml", schema, {
  SERVER_HOST: "127.0.0.1",
});

// YAML 中的占位符会被替换
// app.yaml:
// server:
//   host: "{SERVER_HOST}"
//   port: 3000
// database:
//   url: postgres://localhost/mydb
//   pool: 10
//
// config.server.host === "127.0.0.1"
// config.server.port === 3000

// 解析 YAML 字符串时仍然可以拿到原始对象
const parsed = parseYAML(`
server:
  port: 3000
  host: localhost
database:
  url: postgres://localhost/mydb
  pool: 10
`);
// parsed.server.port === 3000
```

说明：
- 占位符格式是 `{SERVER_HOST}`
- 第三个参数 `env` 会覆盖当前 `process.env` 里的同名变量
- 如果占位符找不到对应环境变量，`loadYAMLConfig` 会抛错

## 配置热更新

使用 `createConfigWatcher` 实现配置动态更新：

```typescript
import { createConfigWatcher } from "@ventostack/core";

const watcher = createConfigWatcher({
  interval: 5000, // 每 5 秒检查一次
  onChange: async (newConfig, oldConfig) => {
    console.log("配置已更新:", newConfig);
    // 更新应用状态
    if (newConfig.logLevel !== oldConfig.logLevel) {
      logger.setLevel(newConfig.logLevel as string);
    }
  },
});

// 启动监控，传入初始配置
watcher.start(initialConfig);

// 手动触发更新
await watcher.update(newConfig);

// 停止监控
watcher.stop();
```

## 配置加密

对敏感配置值进行加密存储：

```typescript
import { createConfigEncryptor } from "@ventostack/core";

const encryptor = createConfigEncryptor({
  key: process.env.ENCRYPTION_KEY!, // 32 字节
});

// 加密配置值
const encrypted = await encryptor.encrypt("my-secret-password");
// "ENC:base64encodeddata..."

// 解密
const decrypted = await encryptor.decrypt(encrypted);
// "my-secret-password"

// 判断是否已加密
encryptor.isEncrypted("ENC:xxx"); // true
encryptor.isEncrypted("plain");   // false
```

## 12-Factor 配置

[12-Factor App](https://12factor.net/config) 是一套由 Heroku 提出的云原生应用最佳实践。其中第 III 条「配置」原则要求：**所有与环境相关的配置（数据库地址、API 密钥、端口号等）必须存储在环境变量中，而绝不能硬编码在源代码里**。

这样做的好处：
- 同一份代码可以部署到开发、测试、生产等不同环境
- 敏感信息（密码、密钥）不会出现在代码仓库中
- 配置变更无需重新编译或发布代码

VentoStack 内置了对 12-Factor 规范的完整支持：

```typescript

import { loadTwelveFactorConfig, validateEnvVars } from "@ventostack/core";

// 验证必要的环境变量
const { valid, missing } = validateEnvVars(["DATABASE_URL", "JWT_SECRET"]);
if (!valid) {
  console.error("缺少必要的环境变量:", missing);
  process.exit(1);
}

// 加载标准 12-Factor 配置
const { config, warnings } = loadTwelveFactorConfig();

if (warnings.length > 0) {
  console.warn("配置警告:", warnings);
}

// config.port, config.env, config.logLevel, config.databaseUrl ...
```


## CLI 参数解析

使用 `parseArgs` 解析命令行参数：

```typescript
import { parseArgs } from "@ventostack/core";

// bun run src/main.ts --port 8080 --env production
const args = parseArgs(process.argv.slice(2));
// args.port === "8080"
// args.env === "production"
```

## 安全预检

使用 `securityPrecheck` 在启动时检查安全配置：

```typescript
import { securityPrecheck } from "@ventostack/core";

const result = securityPrecheck({
  requiredSecrets: ["JWT_SECRET", "DATABASE_URL"], // 这些环境变量必须存在且非空
  minSecretLength: 32, // 这些密钥至少要有 32 字符
  requireHTTPS: true, // 仅在 production 下要求 PROTOCOL / APP_PROTOCOL = https
  disallowDebug: true, // 仅在 production 下禁止 DEBUG=1 或 DEBUG=true
});

if (!result.passed) {
  console.error("安全检查失败:", result.errors);
  process.exit(1);
}
```

说明：
- `requiredSecrets` 会逐个检查环境变量是否存在
- `minSecretLength` 只对 `requiredSecrets` 中声明的变量生效
- `requireHTTPS` 会读取 `PROTOCOL` 或 `APP_PROTOCOL`
- `disallowDebug` 只在生产环境生效，开发环境不拦截

## 配置脱敏

当配置字段标记了 `sensitive: true` 时，`createConfig` / `loadConfig` / `loadYAMLConfig` 返回的配置对象在 `console.log(config)` 或 `util.inspect(config)` 时会自动脱敏。

如果你只想安全地读取某一个字段，可以用 `safeConfig(config)`：

```typescript
import { safeConfig } from "@ventostack/core";

const masked = safeConfig(config);

console.log(masked.jwtSecret); // "***"
console.log(masked.host); // 原值
```

`safeConfig(config)` 会返回一个新的安全快照，不会修改原始配置对象。

如果你只想打印某个手工组装的普通对象，再用 `sanitizeConfig`：

```typescript
import { sanitizeConfig } from "@ventostack/core";

const schema = {
  port: { type: "number" },
  jwtSecret: { type: "string", sensitive: true },
  databaseUrl: { type: "string", sensitive: true },
};

const config = {
  port: 3000,
  jwtSecret: "super-secret-key",
  databaseUrl: "postgres://user:pass@localhost/db",
};

const sanitized = sanitizeConfig(schema, config);
// { port: 3000, jwtSecret: "***", databaseUrl: "***" }

console.log("当前配置:", sanitized); // 安全输出
```

说明：
- `config.jwtSecret` 直接读取时仍然是原值，方便业务逻辑使用
- 如果你要写日志，优先打印整个配置对象，或者先用 `safeConfig(config)`
- `safeConfig(config)` 更适合配置对象，`sanitizeConfig` 更适合你自己额外组装的普通对象

## 标签日志

在启动阶段、CLI 脚本、种子数据等场景中，常常需要轻量的 `[tag] message` 格式日志。`createTagLogger` 提供统一的标签日志，无需初始化 `Logger` 实例：

```typescript
import { createTagLogger } from "@ventostack/core";

const log = createTagLogger("cache");

log.info("Using Redis adapter");   // → [cache] Using Redis adapter
log.warn("Connection slow");       // → [cache] Connection slow
log.error("Connection lost");      // → [cache] Connection lost
```

说明：
- 用于应用启动阶段（`Logger` 尚未初始化时）、CLI 命令、迁移/种子脚本等场景
- 业务运行时日志请使用 `createLogger`（见 [可观测性 — 日志](/framework/observability/logging)）
- 同一个 tag 可在多个文件中复用，保持日志前缀一致

## 相关模块

以下配置相关模块也存在于 `@ventostack/core` 中，但由独立文档页面覆盖：

- **YAML 配置** — `parseYAML`、`stringifyYAML`、`loadYAMLConfig`（见 [YAML 配置](/framework/core/yaml-config)）
- **配置热更新** — `createConfigWatcher`（见 [配置热重载](/framework/core/config-watch)）
- **配置加密** — `createConfigEncryptor`（见 [配置加密](/framework/core/config-encryption)）
- **12-Factor 配置** — `loadTwelveFactorConfig`、`validateEnvVars`（见 [12-Factor 配置](/framework/core/twelve-factor)）
