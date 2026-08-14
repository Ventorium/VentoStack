---
title: CLI 工具
description: VentoStack 命令行工具，支持代码生成、数据库迁移、密码哈希和项目脚手架
---

# CLI 工具

`@ventostack/cli` 提供 VentoStack 的命令行基础设施，基于链式注册模式构建，支持自定义命令扩展。它有两种使用形态：

1. **命令行工具（开箱即用）**：通过 `bin`（`ventostack`）直接执行脚手架、代码生成、迁移、密码哈希等官方命令
2. **嵌入式库（API）**：业务应用可用 `createCLI()` + `createXxxCommand()` 组合自己的 CLI，复用官方命令或注册自定义命令

## 安装与直接使用

```bash
bun add @ventostack/cli
bunx @ventostack/cli <command> [options]
```

`ventostack` 是本包提供的 bin 命令名，与 `bunx @ventostack/cli` 等价（全局安装后可直接使用 `ventostack`，下述内置命令示例中的 `ventostack` 均可替换为 `bunx @ventostack/cli`）。

```bash
bunx @ventostack/cli create --name my-app          # 创建新项目
bunx @ventostack/cli generate model User          # 生成 Model 模板
bunx @ventostack/cli migrate status               # 查看迁移状态
bunx @ventostack/cli password my-secret           # 生成密码哈希
bunx @ventostack/cli help                         # 查看全部命令
```

## CLI 入口

### 创建 CLI 实例

```ts
import { createCLI } from "@ventostack/cli";

const cli = createCLI("myapp", "1.0.0");
cli.register(myCommand);
await cli.run();
```

```ts
function createCLI(name: string, version: string): CLI
```

返回的 `CLI` 实例支持链式注册命令，内置 `help` 和 `version` 两个默认命令。

### 默认运行入口

```ts
import { run } from "@ventostack/cli";

await run(); // 注册全部官方命令（create/generate/migrate/password）并启动
```

### 自定义命令

```ts
import type { Command } from "@ventostack/cli";

const myCommand: Command = {
  name: "hello",
  description: "Say hello",
  options: [
    { name: "name", alias: "n", description: "Your name", required: true },
  ],
  action: async (args) => {
    console.log(`Hello, ${args.name}!`);
  },
};

cli.register(myCommand);
```

## 内置命令

### generate — 代码脚手架

生成 controller、model 或 migration 模板文件。

```ts
import { createGenerateCommand } from "@ventostack/cli";

const cmd = createGenerateCommand({ outputDir?: string; timestampFn?: () => string });
```

```bash
ventostack generate controller User    # → user.controller.ts
ventostack generate model User         # → user.model.ts
ventostack generate migration create_users # → 20260508120000_create_users.ts
```

**生成内容：**
- **controller** — 包含 `index`、`show`、`create`、`update`、`delete` 五个标准方法
- **model** — 使用 `defineModel` 定义，默认包含 `id`、`name`、`createdAt`、`updatedAt` 字段
- **migration** — 带时间戳前缀的迁移文件，包含 `up` 和 `down` 桩代码

### migrate — 数据库迁移

执行迁移、回滚、查看状态或生成迁移文件。

```ts
import { createMigrateCommand } from "@ventostack/cli";

const cmd = createMigrateCommand({ runner?: MigrationRunner; outputDir?: string });
```

```bash
ventostack migrate up                        # 执行所有待运行迁移
ventostack migrate down                      # 回滚最近 1 次迁移
ventostack migrate down --steps 3            # 回滚最近 3 次迁移
ventostack migrate status                    # 查看所有迁移状态
ventostack migrate generate add_email_field  # 生成新迁移文件
```

| 子命令 | 说明 |
|--------|------|
| `up` | 执行所有 pending 迁移 |
| `down` | 回滚指定步数（默认 1 步，`-s` 指定） |
| `status` | 列出所有迁移及执行时间 |
| `generate <name>` | 生成带时间戳的新迁移文件 |

### password — 密码哈希

使用 `Bun.password` 生成安全的密码哈希。

```ts
import { createPasswordCommand } from "@ventostack/cli";

const cmd = createPasswordCommand();
```

```bash
ventostack password "my-secret-password"
# 输出: $argon2id$v=19$m=... (哈希字符串)
```

### create — 项目脚手架

创建新的 VentoStack 项目目录结构。

```ts
import { createScaffoldCommand } from "@ventostack/cli";

const cmd = createScaffoldCommand();
```

```bash
ventostack create --name my-app                       # minimal 模板
ventostack create --name my-app --template full       # 完整模板
ventostack create --name my-app --directory ./projects/my-app
```

**生成的文件：**

| 文件 | 说明 |
|------|------|
| `package.json` | 项目配置，含 dev/build/test/typecheck 脚本 |
| `tsconfig.json` | TypeScript 严格模式配置 |
| `src/index.ts` | 入口文件，含示例路由 |
| `.gitignore` | Git 忽略规则 |
| `.env.example` | 环境变量示例 |
| `Dockerfile` | 基于 `oven/bun:1` 的多阶段构建 |

`full` 模板额外创建 `src/routes`、`src/services`、`tests` 目录。
