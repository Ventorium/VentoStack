# @ventostack/cli

VentoStack 的命令行基础框架和官方工程命令集合，用于承载脚手架、迁移及运维类操作。

## 核心能力

- 函数式 CLI、命令和选项定义
- 项目及模块代码生成命令
- 数据库迁移命令
- 安全密码生成命令
- 可复用的命令注册与执行入口

## 使用边界

CLI 属于控制边界。业务项目可以组合已有命令或注册自己的命令，但不应从 HTTP 请求直接触发高权限 CLI 操作。

```ts
import { createCLI, createMigrateCommand } from "@ventostack/cli";

const cli = createCLI("my-app", "1.0.0");
cli.register(createMigrateCommand());
```
