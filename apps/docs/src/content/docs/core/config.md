---
title: 配置管理
description: 使用 createConfig 和 loadConfig 管理应用配置，支持环境变量、YAML 文件和 12-Factor 规范
---

Aeron 提供了多种配置管理方式，从简单的环境变量读取到完整的 12-Factor 配置系统。

## 基本配置

使用 `createConfig` 定义 schema 并读取配置：

```typescript
import { createConfig } from "@aeron/core";

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

## 支持的字段类型

```typescript
type ConfigFieldDef = {
  type: "string" | "number" | "boolean";
  env?: string;        // 环境变量名
  default?: unknown;   // 默认值
  required?: boolean;  // 是否必填（无默认值时）
  sensitive?: boolean; // 敏感字段（日志中脱敏）
};
```

## 分环境配置文件

`loadConfig` 支持从 JSON 文件加载配置，并按环境合并：

```typescript
import { loadConfig } from "@aeron/core";

// 读取 config/base.json 和 config/${NODE_ENV}.json
const config = await loadConfig(
  {
    port: { type: "number", default: 3000 },
    databaseUrl: { type: "string", required: true },
  },
  {
    dir: "./config",  // 配置文件目录
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

使用 `loadYAMLConfig` 加载 YAML 格式的配置：

```typescript
import { loadYAMLConfig, parseYAML } from "@aeron/core";

// 从文件加载
const config = await loadYAMLConfig("./config/app.yaml");

// 解析 YAML 字符串
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

## 配置热更新

使用 `createConfigWatcher` 实现配置动态更新：

```typescript
import { createConfigWatcher } from "@aeron/core";

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
import { createConfigEncryptor } from "@aeron/core";

const encryptor = createConfigEncryptor({
  key: process.env.ENCRYPTION_KEY!, // 至少 32 字节
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

遵循 [12-Factor App](https://12factor.net/config) 规范，从环境变量加载配置：

```typescript
import { loadTwelveFactorConfig, validateEnvVars } from "@aeron/core";

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
import { parseArgs } from "@aeron/core";

// bun run src/main.ts --port 8080 --env production
const args = parseArgs(process.argv.slice(2));
// args.port === "8080"
// args.env === "production"
```

## 安全预检

使用 `securityPrecheck` 在启动时检查安全配置：

```typescript
import { securityPrecheck } from "@aeron/core";

const result = securityPrecheck({
  requireHttps: true,          // 生产环境必须 HTTPS
  checkWeakSecrets: true,      // 检查弱密钥
  sensitiveFields: ["JWT_SECRET", "DATABASE_URL"],
});

if (!result.passed) {
  console.error("安全检查失败:", result.violations);
  process.exit(1);
}
```

## 配置脱敏

使用 `sanitizeConfig` 对配置进行脱敏处理（用于日志输出）：

```typescript
import { sanitizeConfig } from "@aeron/core";

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
