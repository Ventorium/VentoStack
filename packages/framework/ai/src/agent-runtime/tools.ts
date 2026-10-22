import { posix } from 'node:path';
import type { AgentTool } from '../agent-engine/types';
import type { AgentRuntimeClient } from './types';

const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;

export interface AgentRuntimeToolOptions {
  /** 当前会话工作区（默认 /workspace） */
  workspace?: string;
  /** 可读根路径；默认仅 workspace */
  readRoots?: string[];
  /** 可写根路径；默认仅 workspace */
  writeRoots?: string[];
  /** 禁止写入的路径前缀（知识库/会话记忆） */
  protectedWritePrefixes?: string[];
  onFileWritten?: (path: string, content: Uint8Array) => Promise<void>;
  onWorkspaceChanged?: () => Promise<void>;
}

function normalizeRoots(roots: string[] | undefined, fallback: string): string[] {
  const values = (roots && roots.length > 0 ? roots : [fallback]).map((root) => posix.resolve(root));
  return [...new Set(values)];
}

function resolvePath(roots: string[], workspace: string, rawPath: string): string {
  if (!rawPath || rawPath.includes('\0')) throw new Error('文件路径不能为空且不能包含空字符');
  const absolute = rawPath.startsWith('/')
    ? posix.resolve(rawPath)
    : posix.resolve(workspace, rawPath);
  const allowed = roots.some(
    (root) => absolute === root || absolute.startsWith(`${root}/`),
  );
  if (!allowed) throw new Error('文件路径必须位于当前会话工作区');
  return absolute;
}

function truncate(value: string): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= MAX_OUTPUT_BYTES) return value;
  return `${new TextDecoder().decode(bytes.slice(0, MAX_OUTPUT_BYTES))}\n...[输出已截断]`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** 危险命令硬阻断：这是纵深防御，真正的隔离边界仍是 Firecracker。 */
export function isDangerousCommand(command: string[]): string | null {
  const text = command.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return '命令不能为空';
  const patterns: Array<{ re: RegExp; reason: string }> = [
    { re: /(^|[;&|]\s*)rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+\/(\s|$|\*)/, reason: '禁止递归删除根目录' },
    { re: /\bmkfs(\.|\s|$)/, reason: '禁止格式化文件系统' },
    { re: /\bdd\b[\s\S]*\bof=\/dev\//, reason: '禁止直接写块设备' },
    { re: /\b(shutdown|reboot|poweroff|halt|init\s+[06])\b/, reason: '禁止关机/重启' },
    { re: /\b(mount|umount)\s+\//, reason: '禁止挂载/卸载根路径' },
    { re: /\bchroot\b/, reason: '禁止 chroot' },
    { re: /\bchmod\s+-R\s+777\s+\//, reason: '禁止递归放宽根目录权限' },
    { re: />\s*\/agentd\b/, reason: '禁止覆盖 guest agent' },
    { re: />\s*\/proc\/sys\b/, reason: '禁止写 /proc/sys' },
  ];
  for (const pattern of patterns) {
    if (pattern.re.test(text)) return pattern.reason;
  }
  return null;
}

export function createAgentRuntimeTools(
  runtime: AgentRuntimeClient,
  sandboxId: string,
  options?: AgentRuntimeToolOptions,
): AgentTool[] {
  const workspace = posix.resolve(options?.workspace ?? '/workspace');
  const readRoots = normalizeRoots(options?.readRoots, workspace);
  const writeRoots = normalizeRoots(options?.writeRoots, workspace);
  const protectedPrefixes = (options?.protectedWritePrefixes ?? []).map((item) =>
    posix.resolve(item),
  );

  function assertWritable(path: string): void {
    if (
      protectedPrefixes.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      )
    ) {
      throw new Error('该目录为只读镜像（知识库/会话记忆），不能写入');
    }
  }

  return [
    {
      name: 'terminal',
      label: '终端',
      description:
        '在当前 Linux 环境中执行命令。工作目录为 /workspace；支持管道、重定向与常见系统命令。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          command: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 64,
          },
          timeoutMs: { type: 'integer', minimum: 1000, maximum: 600000 },
          background: { type: 'boolean' },
        },
        required: ['command'],
      },
      riskLevel: 'high',
      requiresApproval: true,
      async execute(_id, params) {
        const { command, timeoutMs, background } = params as {
          command: string[];
          timeoutMs?: number;
          background?: boolean;
        };
        const blocked = isDangerousCommand(command);
        if (blocked) {
          return {
            content: [{ type: 'text', text: `命令被安全策略拒绝：${blocked}` }],
            details: { blocked: true, reason: blocked },
          };
        }
        await runtime.runCommand(sandboxId, ['mkdir', '-p', workspace], { cwd: '/workspace' }).catch(() => undefined);
        let effective = command;
        if (background) {
          const log = `${workspace}/.agent-logs/${crypto.randomUUID()}.log`;
          const script = [
            `mkdir -p ${shellQuote(`${workspace}/.agent-logs`)}`,
            `nohup ${command.map(shellQuote).join(' ')} > ${shellQuote(log)} 2>&1 &`,
            'echo "PID=$!"',
            `echo "LOG=${log}"`,
          ].join('; ');
          effective = ['sh', '-lc', script];
        }
        const result = await runtime.runCommand(sandboxId, effective, {
          cwd: workspace,
          timeoutMs: Math.min(Math.max(timeoutMs ?? 60_000, 1_000), 600_000),
        });
        await options?.onWorkspaceChanged?.();
        const text = truncate(`${result.stdout}${result.stderr}`);
        return {
          content: [
            {
              type: 'text',
              text:
                result.timedOut
                  ? `${text}\n[命令超时]`
                  : result.exitCode === 0
                    ? text
                    : `${text}\n[退出码 ${result.exitCode ?? 'unknown'}]`,
            },
          ],
          details: {
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            command: command.slice(0, 8),
            ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
          },
        };
      },
    },
    {
      name: 'file_read',
      label: '读取文件',
      description: '读取当前 Linux 环境中的文件（/workspace 与 ~/.vento-agent）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string', minLength: 1, maxLength: 4096 } },
        required: ['path'],
      },
      riskLevel: 'low',
      async execute(_id, params) {
        const path = resolvePath(readRoots, workspace, (params as { path: string }).path);
        const bytes = await runtime.readFile(sandboxId, path);
        if (bytes.byteLength > MAX_FILE_BYTES) {
          throw new Error('文件过大，请使用 terminal 配合 head/tail/rg 分段读取');
        }
        const text = new TextDecoder().decode(bytes);
        return { content: [{ type: 'text', text }], details: { path, bytes: text.length } };
      },
    },
    {
      name: 'file_write',
      label: '写入文件',
      description: '写入当前 Linux 环境中的文件（/workspace 与 ~/.vento-agent）。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', minLength: 1, maxLength: 4096 },
          content: { type: 'string', maxLength: MAX_FILE_BYTES },
        },
        required: ['path', 'content'],
      },
      riskLevel: 'high',
      requiresApproval: true,
      async execute(_id, params) {
        const { path: rawPath, content } = params as { path: string; content: string };
        const path = resolvePath(writeRoots, workspace, rawPath);
        assertWritable(path);
        await runtime.runCommand(sandboxId, ['mkdir', '-p', posix.dirname(path)], {
          cwd: workspace,
        });
        const bytes = new TextEncoder().encode(content);
        await runtime.writeFile(sandboxId, path, bytes);
        await options?.onFileWritten?.(path.startsWith(`${workspace}/`) ? path.slice(workspace.length + 1) : path, bytes);
        await options?.onWorkspaceChanged?.();
        return { content: [{ type: 'text', text: `已写入 ${path}` }], details: { path, bytes: content.length } };
      },
    },
  ];
}
