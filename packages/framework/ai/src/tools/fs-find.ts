/**
 * 文件系统工具：find（查找文件）
 */
import type { KnowledgeBaseService } from "../knowledge-base/types";
import type { Tool } from "../tool-registry";

export function createFsFindTool(
  kbService: KnowledgeBaseService,
  defaultKbId: string,
): Tool {
  return {
    name: "find",
    description:
      "按文件名或扩展名查找知识库中的文件。类似 find 命令。",
    parameters: [
      {
        name: "name",
        type: "string",
        description: "文件名关键词",
        required: false,
      },
      {
        name: "ext",
        type: "string",
        description: "文件扩展名，如 .md",
        required: false,
      },
      {
        name: "path",
        type: "string",
        description: "限定搜索的目录路径",
        required: false,
      },
    ],
    handler: async (params) => {
      const name = params.name as string | undefined;
      const ext = params.ext as string | undefined;
      const path = params.path as string | undefined;
      return kbService.find(defaultKbId, name, ext, path, "");
    },
  };
}
