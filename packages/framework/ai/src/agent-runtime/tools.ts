import { posix } from 'node:path';
import type { AgentTool } from '../agent-engine/types';
import type { AgentRuntimeClient } from './types';

const WORKSPACE = '/workspace';

function workspacePath(path: string): string {
  const normalized = posix.resolve(WORKSPACE, path);
  if (normalized !== WORKSPACE && !normalized.startsWith(`${WORKSPACE}/`)) throw new Error('文件路径必须位于 /workspace');
  return normalized;
}

export function createAgentRuntimeTools(runtime: AgentRuntimeClient, sandboxId: string): AgentTool[] {
  return [
    {
      name: 'terminal', label: '虚拟环境终端', description: '在当前 Agent 的隔离 Linux 虚拟环境中执行命令。',
      parameters: { type: 'object', additionalProperties: false, properties: { command: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 64 } }, required: ['command'] },
      riskLevel: 'high', requiresApproval: true,
      async execute(_id, params) {
        const result = await runtime.runCommand(sandboxId, (params as { command: string[] }).command, WORKSPACE);
        return { content: [{ type: 'text', text: `${result.stdout}${result.stderr}` }], details: result };
      },
    },
    {
      name: 'file_read', label: '读取虚拟环境文件', description: '读取当前 Agent 虚拟环境 /workspace 下的文件。',
      parameters: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', minLength: 1, maxLength: 4096 } }, required: ['path'] },
      riskLevel: 'low',
      async execute(_id, params) {
        const path = workspacePath((params as { path: string }).path);
        const text = new TextDecoder().decode(await runtime.readFile(sandboxId, path));
        return { content: [{ type: 'text', text }], details: { path, bytes: text.length } };
      },
    },
    {
      name: 'file_write', label: '写入虚拟环境文件', description: '写入当前 Agent 虚拟环境 /workspace 下的文件。',
      parameters: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', minLength: 1, maxLength: 4096 }, content: { type: 'string', maxLength: 1_000_000 } }, required: ['path', 'content'] },
      riskLevel: 'high', requiresApproval: true,
      async execute(_id, params) {
        const { path: rawPath, content } = params as { path: string; content: string };
        const path = workspacePath(rawPath);
        await runtime.writeFile(sandboxId, path, new TextEncoder().encode(content));
        return { content: [{ type: 'text', text: `已写入 ${path}` }], details: { path, bytes: content.length } };
      },
    },
  ];
}
