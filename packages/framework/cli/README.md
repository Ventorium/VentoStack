# @ventostack/cli

VentoStack 的命令行工具与嵌入式 CLI 基础框架。它有两种使用形态：

1. **命令行工具（开箱即用）**：通过 `bin`（`ventostack`）直接执行脚手架、代码生成、迁移、密码哈希等官方命令
2. **嵌入式库（API）**：业务应用可用 `createCLI()` + `createXxxCommand()` 组合自己的 CLI，复用官方命令或注册自定义命令

## 安装

```bash
bun add @ventostack/cli
```

## 形态一：命令行工具（直接使用）

安装后通过 `bunx` 运行（或全局安装后直接使用 `ventostack` 命令）：

```bash
bunx @ventostack/cli <command> [options]
```

### 命令速查

| 命令 | 说明 | 示例 |
|---|---|---|
| `create` | 创建新的 VentoStack 项目 | `bunx @ventostack/cli create --name my-app` |
| `generate` | 生成 controller / model / migration 代码 | `bunx @ventostack/cli generate model User` |
| `migrate` | 数据库迁移管理（up/down/status/generate） | `bunx @ventostack/cli migrate up` |
| `password` | 使用 `Bun.password` 生成密码哈希 | `bunx @ventostack/cli password my-secret` |
| `help` | 显示帮助信息 | `bunx @ventostack/cli help` |
| `version` | 显示版本号 | `bunx @ventostack/cli version` |

### create — 项目脚手架

生成一个可直接运行的新项目（package.json、tsconfig.json、入口文件、Dockerfile、.env.example）：

```bash
bunx @ventostack/cli create --name my-app            # minimal 模板
bunx @ventostack/cli create --name my-app --template full   # 含 routes/services/tests 目录
bunx @ventostack/cli create -n my-app -t full -d ./proj     # 指定输出目录
```

| 选项 | 别名 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `--name` | `-n` | ✅ | - | 项目名称 |
| `--template` | `-t` | - | `minimal` | 模板类型：`minimal` / `full` |
| `--directory` | `-d` | - | `./<name>` | 目标目录 |

生成后进入目录启动：

```bash
cd my-app
bun install
bun run dev    # http://localhost:3000
```

### generate — 代码生成

生成 controller / model / migration 模板文件到当前目录：

```bash
bunx @ventostack/cli generate controller User   # user.controller.ts
bunx @ventostack/cli generate model User        # user.model.ts（defineModel 定义）
bunx @ventostack/cli generate migration add_users_table   # <timestamp>_add_users_table.ts
```

生成的模板基于 `@ventostack/core` / `@ventostack/database`，可直接用于业务扩展。

### migrate — 数据库迁移

```bash
bunx @ventostack/cli migrate status          # 查看迁移状态
bunx @ventostack/cli migrate up              # 执行待执行迁移
bunx @ventostack/cli migrate down            # 回滚 1 步
bunx @ventostack/cli migrate down --steps 3  # 回滚 3 步
bunx @ventostack/cli migrate generate add_users_table   # 生成迁移文件
```

> 注意：`up / down / status` 需要业务应用注入迁移执行器（`MigrationRunner`），CLI 本身不持有数据库连接。具体见下方「嵌入式库」形态。

### password — 密码哈希

```bash
bunx @ventostack/cli password my-secret
# 输出：$argon2id$v=19$m=19456,t=2,p=1$...
```

## 形态二：嵌入式库（应用内组合 CLI）

业务应用可以创建自己的 CLI 实例，组合官方命令或注册自定义命令：

```typescript
import { createCLI, createMigrateCommand, createPasswordCommand } from "@ventostack/cli";
import { createMigrationRunner } from "@ventostack/database";

const cli = createCLI("my-app", "1.0.0");

// 注入自己的迁移执行器，使 migrate up/down/status 可用
cli.register(createMigrateCommand({ runner: createMigrationRunner({ db }) }));

// 复用官方命令
cli.register(createPasswordCommand());

// 注册自定义命令
cli.register({
  name: "greet",
  description: "Say hello",
  action: () => console.log("Hello!"),
});

await cli.run(process.argv.slice(2));
```

### 公共 API

| 导出 | 说明 |
|---|---|
| `createCLI(name, version)` | 创建 CLI 实例，支持 `register()` 链式注册与 `run()` 执行 |
| `run()` | 默认运行入口，注册全部官方命令（create/generate/migrate/password） |
| `createScaffoldCommand()` | 项目脚手架命令（`create`） |
| `createGenerateCommand(opts?)` | 代码生成命令（`generate`） |
| `createMigrateCommand(opts?)` | 数据库迁移命令（`migrate`），`opts.runner` 注入执行器 |
| `createPasswordCommand()` | 密码哈希命令（`password`） |
| `Command` / `CommandOption` / `CLI` | 类型定义 |

## 使用边界（安全）

CLI 属于**控制边界**：

- 业务项目可以组合官方命令或注册自己的命令，但不应从 HTTP 请求直接触发高权限 CLI 操作
- 迁移、代码生成等命令直接写入文件系统/数据库，必须由可信操作者（开发者/运维）在受控环境执行
- 命令注册与执行遵循函数式与显式依赖原则，无全局单例

## 参考

- 全部官方命令源码：`packages/framework/cli/src/commands/`
- 项目脚手架模板：`create` 命令生成的 package.json / tsconfig / Dockerfile 模板
- 文档站：`apps/docs/src/content/docs/framework/cli/`
