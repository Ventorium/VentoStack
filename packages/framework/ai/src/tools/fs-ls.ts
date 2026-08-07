/**
 * 文件系统工具：ls（浏览目录）
 */
import type { KnowledgeBaseService } from "../knowledge-base/types";
import type { Tool } from "../tool-registry";

export function createFsLsTool(
  kbService: KnowledgeBaseService,
  defaultKbId: string,
): Tool {
  return {
    name: "ls",
    description:
      "列出知识库目录结构。类似 ls -la 命令。可以浏览文件和文件夹。",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "要浏览的目录路径，默认为根目录",
        required: false,
      },
      {
        name: "depth",
        type: "number",
        description: "递归深度，默认为 2",
        required: false,
      },
    ],
    handler: async (params) => {
      const path = (params.path as string) || ".";
      const depth = (params.depth as number) || 2;
      const entries = await kbService.ls(defaultKbId, path, depth, "");
      return entries;
    },
  };
}
