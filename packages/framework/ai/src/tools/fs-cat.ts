/**
 * 文件系统工具：cat（读取文件内容）
 */
import type { KnowledgeBaseService } from "../knowledge-base/types";
import type { Tool } from "../tool-registry";

export function createFsCatTool(
  kbService: KnowledgeBaseService,
  defaultKbId: string,
): Tool {
  return {
    name: "cat",
    description:
      "读取知识库中的文件内容。类似 cat 命令。返回文件的完整 Markdown 内容。",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "要读取的文件路径",
        required: true,
      },
    ],
    handler: async (params) => {
      const path = params.path as string;
      const content = await kbService.cat(defaultKbId, path, "");
      if (!content) {
        return { error: `文件 ${path} 不存在` };
      }
      return content;
    },
  };
}
