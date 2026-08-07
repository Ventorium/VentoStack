/**
 * 终端工具 — v1.0 阶段
 * 在沙盒内执行 Shell 命令，结果截断后返回
 * 安全措施：命令白名单、超时控制、输出限制
 */
import type { CodeSandbox } from "../code-sandbox/types";

export interface TerminalToolDeps {
  sandbox: CodeSandbox;
}

/** 允许的命令白名单 */
const ALLOWED_COMMANDS = new Set([
  "ls", "cat", "head", "tail", "grep", "find", "wc", "sort", "uniq",
  "echo", "date", "pwd", "whoami", "env", "which", "file", "du", "df",
]);

export function createTerminalTool(deps: TerminalToolDeps) {
  const { sandbox } = deps;

  return {
    name: "terminal",
    description: "在安全沙盒内执行 Shell 命令。仅允许只读命令，禁止修改系统。",
    parameters: [
      {
        name: "command",
        type: "string" as const,
        description: "要执行的 Shell 命令",
        required: true,
      },
    ],
    riskLevel: "high" as const,
    timeout: 30_000,
    async handler(params: Record<string, unknown>): Promise<{ stdout: string; stderr: string; exitCode: number | null } | { error: string }> {
      const command = (params.command as string)?.trim();
      if (!command) {
        return { error: "命令不能为空" };
      }

      // 命令白名单检查
      const cmdName = command.split(/\s+/)[0];
      if (!cmdName || !ALLOWED_COMMANDS.has(cmdName)) {
        return { error: `不允许的命令: ${cmdName}。允许: ${[...ALLOWED_COMMANDS].join(", ")}` };
      }

      // 禁止管道中的危险命令
      if (command.includes("rm ") || command.includes("chmod ") || command.includes("curl ")) {
        return { error: "命令包含不允许的操作" };
      }

      const result = await sandbox.execute(`console.log(await Bun.spawn(${JSON.stringify(command.split(/\s+/))}, {stdout:'pipe'}).text())`);

      return {
        stdout: result.stdout.slice(0, 10_000),
        stderr: result.stderr.slice(0, 2_000),
        exitCode: result.exitCode,
      };
    },
  };
}
