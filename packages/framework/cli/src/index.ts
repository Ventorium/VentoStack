/**
 * @ventostack/cli — CLI 模块公共入口
 *
 * 提供 CLI 构建器、命令注册以及各类子命令的工厂函数。
 */

import { run } from "./cli";

export { createCLI, run } from "./cli";
export type { CLI, Command, CommandOption } from "./cli";
export { createScaffoldCommand } from "./commands/scaffold";
export type { ScaffoldOptions } from "./commands/scaffold";
export { createGenerateCommand } from "./commands/generate";
export type { GenerateOptions } from "./commands/generate";
export { createMigrateCommand } from "./commands/migrate";
export type { MigrateOptions } from "./commands/migrate";
export { createPasswordCommand } from "./commands/password";

// 进程入口：bin 直接执行时启动 CLI
if (import.meta.main) {
  await run();
}
