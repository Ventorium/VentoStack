/**
 * 文件系统工具：tail（读取文件结尾）
 */
import type { KnowledgeBaseService } from "../knowledge-base/types";
import type { Tool } from "../tool-registry";

export function createFsTailTool(
  kbService: KnowledgeBaseService,
  defaultKbId: string,
): Tool {
  return {
    name: "tail",
    description: "读取知识库文件的结尾 N 行。类似 tail 命令。",
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
      return kbService.tail(defaultKbId, path, lines, "");
    },
  };
}
