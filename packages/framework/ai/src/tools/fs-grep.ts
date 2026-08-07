/**
 * 文件系统工具：grep（搜索文件内容）
 */
import type { KnowledgeBaseService } from "../knowledge-base/types";
import type { Tool } from "../tool-registry";

export function createFsGrepTool(
  kbService: KnowledgeBaseService,
  defaultKbId: string,
): Tool {
  return {
    name: "grep",
    description:
      "按关键词搜索知识库中的文件内容。类似 grep -rn 命令。返回匹配的文件路径、行号和内容片段。",
    parameters: [
      {
        name: "query",
        type: "string",
        description: "搜索关键词",
        required: true,
      },
      {
        name: "path",
        type: "string",
        description: "限定搜索的目录路径，默认搜索全部",
        required: false,
      },
      {
        name: "limit",
        type: "number",
        description: "返回结果数量，默认 10",
        required: false,
      },
    ],
    handler: async (params) => {
      const query = params.query as string;
      const path = params.path as string | undefined;
      const limit = (params.limit as number) || 10;
      return kbService.grep(defaultKbId, query, path, "", limit);
    },
  };
}
