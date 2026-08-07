/**
 * 文件操作工具 — v1.0 阶段
 * 提供受控的文件读写能力
 * 安全措施：路径白名单、大小限制、权限检查
 */
import { resolve } from "node:path";

export interface FileOpsToolDeps {
  /** 允许访问的基础目录 */
  allowedPaths: string[];
  /** 最大读取大小（字节） */
  maxReadSize?: number;
  /** 最大写入大小（字节） */
  maxWriteSize?: number;
}

const DEFAULT_MAX_READ_SIZE = 100 * 1024;  // 100KB
const DEFAULT_MAX_WRITE_SIZE = 500 * 1024; // 500KB

export function createFileReadTool(deps: FileOpsToolDeps) {
  const maxReadSize = deps.maxReadSize ?? DEFAULT_MAX_READ_SIZE;

  return {
    name: "file-read",
    description: "读取指定路径的文件内容。限制在允许的目录范围内。",
    parameters: [
      {
        name: "path",
        type: "string" as const,
        description: "文件路径",
        required: true,
      },
    ],
    riskLevel: "medium" as const,
    async handler(params: Record<string, unknown>): Promise<{ content: string; path: string } | { error: string }> {
      const filePath = params.path as string;
      if (!filePath) return { error: "路径不能为空" };

      // 路径安全检查：使用 node:path 的同步 resolve（Bun.resolve 是异步的）
      const resolved = resolve(filePath);
      const isAllowed = deps.allowedPaths.some(
        (p) => resolved.startsWith(resolve(p)),
      );
      if (!isAllowed) {
        return { error: "不允许访问该路径" };
      }

      try {
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          return { error: `文件不存在: ${filePath}` };
        }
        if (file.size > maxReadSize) {
          return { error: `文件过大 (${file.size} bytes)，最大允许 ${maxReadSize} bytes` };
        }
        const content = await file.text();
        return { content: content.slice(0, maxReadSize), path: filePath };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "读取失败" };
      }
    },
  };
}

export function createFileWriteTool(deps: FileOpsToolDeps) {
  const maxWriteSize = deps.maxWriteSize ?? DEFAULT_MAX_WRITE_SIZE;

  return {
    name: "file-write",
    description: "将内容写入指定路径的文件。限制在允许的目录范围内。",
    parameters: [
      {
        name: "path",
        type: "string" as const,
        description: "文件路径",
        required: true,
      },
      {
        name: "content",
        type: "string" as const,
        description: "要写入的内容",
        required: true,
      },
    ],
    riskLevel: "high" as const,
    requiresApproval: true,
    async handler(params: Record<string, unknown>): Promise<{ success: boolean; path: string } | { error: string }> {
      const filePath = params.path as string;
      const content = params.content as string;

      if (!filePath) return { error: "路径不能为空" };
      if (!content) return { error: "内容不能为空" };
      if (content.length > maxWriteSize) {
        return { error: `内容过大 (${content.length} bytes)，最大允许 ${maxWriteSize} bytes` };
      }

      // 路径安全检查：使用 node:path 的同步 resolve（Bun.resolve 是异步的）
      const resolved = resolve(filePath);
      const isAllowed = deps.allowedPaths.some(
        (p) => resolved.startsWith(resolve(p)),
      );
      if (!isAllowed) {
        return { error: "不允许写入该路径" };
      }

      try {
        await Bun.write(filePath, content);
        return { success: true, path: filePath };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "写入失败" };
      }
    },
  };
}
