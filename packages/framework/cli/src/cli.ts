// @ventostack/cli - CLI 入口和命令路由

import { createScaffoldCommand } from "./commands/scaffold";
import { createGenerateCommand } from "./commands/generate";
import { createMigrateCommand } from "./commands/migrate";
import { createPasswordCommand } from "./commands/password";

/** 命令选项定义 */
export interface CommandOption {
  /** 选项名称 */
  name: string;
  /** 短别名（单字符） */
  alias?: string;
  /** 选项说明 */
  description: string;
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  default?: unknown;
}

/** 命令定义 */
export interface Command {
  /** 命令名称 */
  name: string;
  /** 命令说明 */
  description: string;
  /** 命令选项列表 */
  options?: CommandOption[];
  /** 命令执行函数 */
  action: (args: Record<string, unknown>) => Promise<void> | void;
}

/** CLI 实例 */
export interface CLI {
  /**
   * 注册命令
   * @param command - 命令定义
   * @returns CLI 实例（链式调用）
   */
  register(command: Command): CLI;

  /**
   * 运行 CLI
   * @param argv - 可选的命令行参数数组，默认使用 Bun.argv
   * @returns Promise<void>
   */
  run(argv?: string[]): Promise<void>;
}

/**
 * 解析命令行参数
 * @param argv - 参数数组
 * @param options - 命令选项定义，用于识别别名和默认值
 * @returns 解析后的参数对象
 */
function parseArgv(argv: string[], options?: CommandOption[]): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const positional: string[] = [];

  // Build alias map
  const aliasMap = new Map<string, string>();
  if (options) {
    for (const opt of options) {
      if (opt.alias) {
        aliasMap.set(opt.alias, opt.name);
      }
      if (opt.default !== undefined) {
        args[opt.name] = opt.default;
      }
    }
  }

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        // --option=value
        const key = arg.slice(2, eqIdx);
        const value = arg.slice(eqIdx + 1);
        args[key] = value;
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          // --option value
          args[key] = next;
          i++;
        } else {
          // --flag (boolean)
          args[key] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const alias = arg.slice(1);
      const key = aliasMap.get(alias) ?? alias;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      positional.push(arg);
    }

    i++;
  }

  if (positional.length > 0) {
    args._ = positional;
  }

  return args;
}

/**
 * 格式化帮助信息
 * @param name - CLI 名称
 * @param commands - 已注册的命令映射
 * @returns 帮助文本
 */
function formatHelp(name: string, commands: Map<string, Command>): string {
  const lines: string[] = [`Usage: ${name} <command> [options]`, "", "Commands:"];
  for (const [cmdName, cmd] of commands) {
    lines.push(`  ${cmdName.padEnd(20)} ${cmd.description}`);
  }
  lines.push(`  ${"help".padEnd(20)} Show this help message`);
  lines.push(`  ${"version".padEnd(20)} Show version`);
  return lines.join("\n");
}

/**
 * 创建 CLI 实例
 * @param name - CLI 名称
 * @param version - 版本号
 * @returns CLI 实例
 */
export function createCLI(name: string, version: string): CLI {
  const commands = new Map<string, Command>();

  const cli: CLI = {
    register(command: Command): CLI {
      commands.set(command.name, command);
      return cli;
    },

    async run(argv?: string[]): Promise<void> {
      const rawArgs = argv ?? Bun.argv.slice(2);
      const commandName = rawArgs[0];

      if (!commandName || commandName === "help") {
        console.log(formatHelp(name, commands));
        return;
      }

      if (commandName === "version") {
        console.log(`${name} v${version}`);
        return;
      }

      const command = commands.get(commandName);
      if (!command) {
        console.error(`Unknown command: ${commandName}`);
        console.log(formatHelp(name, commands));
        return;
      }

      const parsed = parseArgv(rawArgs.slice(1), command.options);
      await command.action(parsed);
    },
  };

  return cli;
}

/**
 * 默认 CLI 运行入口
 *
 * 注册官方内置命令（create / generate / migrate / password）并启动。
 * @returns Promise<void>
 */
export function run(): Promise<void> {
  const cli = createCLI("ventostack", "0.1.0");
  cli.register(createScaffoldCommand());
  cli.register(createGenerateCommand());
  cli.register(createMigrateCommand());
  cli.register(createPasswordCommand());
  return cli.run();
}
