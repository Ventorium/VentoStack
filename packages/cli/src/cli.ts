// @aeron/cli - CLI 入口和命令路由

export interface CommandOption {
  name: string;
  alias?: string;
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface Command {
  name: string;
  description: string;
  options?: CommandOption[];
  action: (args: Record<string, unknown>) => Promise<void> | void;
}

export interface CLI {
  register(command: Command): CLI;
  run(argv?: string[]): Promise<void>;
}

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

function formatHelp(name: string, commands: Map<string, Command>): string {
  const lines: string[] = [`Usage: ${name} <command> [options]`, "", "Commands:"];
  for (const [cmdName, cmd] of commands) {
    lines.push(`  ${cmdName.padEnd(20)} ${cmd.description}`);
  }
  lines.push(`  ${"help".padEnd(20)} Show this help message`);
  lines.push(`  ${"version".padEnd(20)} Show version`);
  return lines.join("\n");
}

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

export function run(): Promise<void> {
  const cli = createCLI("aeron", "0.1.0");

  // Commands are registered by the consuming app
  // This is the default entry point
  return cli.run();
}
