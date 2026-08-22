/**
 * 终端工具 — 在沙盒内执行受限只读 Shell 命令
 * 安全措施：命令白名单 + 参数级校验、禁用全部 shell 结构字符（管道/分号/重定向/命令替换）、
 * 超时控制、输出限制。
 * 注意：实际隔离强度取决于注入的 CodeSandbox 实现 —— docker 沙箱有网络/内存隔离
 * （--network none / --memory），process 沙箱仅有超时与环境变量白名单，
 * 子进程继承服务账号权限，不应在多租户场景单独依赖。
 */
import type { CodeSandbox } from "../code-sandbox/types";

export interface TerminalToolDeps {
  sandbox: CodeSandbox;
}

/** 允许的只读命令白名单（不含具备写副作用的命令：无 rm/chmod/sort -o/env 等） */
const ALLOWED_COMMANDS = new Set([
  "ls", "cat", "head", "tail", "grep", "find", "wc",
  "echo", "date", "pwd", "whoami", "which", "file", "du", "df",
]);

/** 禁止的参数：find 的删除/执行/输出到文件类旗标（可绕过「只读」约束），以及 date 的改时钟旗标 */
const FORBIDDEN_ARGS = new Set([
  "-delete", "-exec", "-execdir", "-ok", "-okdir", "-fls", "-fprintf",
  "-fprint", "-fprint0",
  "-s", "--set",
]);

/** 参数级前缀禁止：--set=VALUE 形式（date 改系统时钟） */
const FORBIDDEN_ARG_PREFIXES = ["--set="];

/** 参数字符白名单：仅允许不含 shell 元字符与通配符的普通参数 */
const SAFE_ARG_RE = /^[A-Za-z0-9_@%+=:,.\-/]+$/;
/** shell 结构字符：出现即整条拒绝，不做任何 shell 解释 */
const SHELL_META_RE = /[|;&`$()<>\n]/;

export function createTerminalTool(deps: TerminalToolDeps) {
  const { sandbox } = deps;

  return {
    name: "terminal",
    description: "在安全沙盒内执行只读 Shell 命令。仅允许白名单内的只读命令，禁止修改系统。",
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

      // 1. 拒绝一切 shell 结构字符：不支持管道、分号、重定向、命令替换
      if (SHELL_META_RE.test(command)) {
        return { error: `命令包含不允许的操作符: ${command}` };
      }

      // 2. 命令名白名单
      const tokens = command.split(/\s+/);
      const cmdName = tokens[0]!;
      if (!ALLOWED_COMMANDS.has(cmdName)) {
        return { error: `不允许的命令: ${cmdName}。允许: ${[...ALLOWED_COMMANDS].join(", ")}` };
      }

      // 3. 参数级检查：命中写副作用旗标（含 --set=VALUE 前缀形式）直接拒绝；其余参数必须匹配安全字符集
      for (const arg of tokens.slice(1)) {
        if (FORBIDDEN_ARGS.has(arg) || FORBIDDEN_ARG_PREFIXES.some((p) => arg.startsWith(p))) {
          return { error: "命令包含不允许的操作" };
        }
        if (!SAFE_ARG_RE.test(arg)) {
          return { error: `参数包含不允许的字符: ${arg}` };
        }
      }

      const result = await sandbox.execute(
        `console.log(await Bun.spawn(${JSON.stringify(tokens)}, { stdout: 'pipe' }).text())`,
      );

      return {
        stdout: result.stdout.slice(0, 10_000),
        stderr: result.stderr.slice(0, 2_000),
        exitCode: result.exitCode,
      };
    },
  };
}
