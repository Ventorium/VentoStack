/**
 * 文件系统工具：head（读取文件开头）
 */
import type { KnowledgeBaseService } from "../knowledge-base/types";
import type { Tool } from "../tool-registry";

export function createFsHeadTool(
  kbService: KnowledgeBaseService,
  defaultKbId: string,
): Tool {
  return {
    name: "head",
    description: "读取知识库文件的开头 N 行。类似 head 命令。",
    parameters: [
      {
        name: "path",
        type: "string",
        description: "要读取的文件路径",
        required: true,
      },
      {
        name: "lines",
        type: "number",
        description: "读取的行数，默认 20",
        required: false,
      },
    ],
    handler: async (params) => {
      const path = params.path as string;
      const lines = (params.lines as number) || 20;
      return kbService.head(defaultKbId, path, lines, "");
    },
  };
}
