/**
 * 知识库目录浏览工具
 * 列出知识库的目录结构，供 LLM 自主浏览
 */
import type { KnowledgeBaseService, FileEntry } from "../knowledge-base/types";

export interface KBBrowseToolDeps {
  kbService: KnowledgeBaseService;
  tenantId: string;
}

export function createKBBrowseTool(deps: KBBrowseToolDeps) {
  const { kbService, tenantId } = deps;

  return {
    name: "kb-browse",
    description: "浏览知识库目录结构。列出指定路径下的文件和子目录。",
    parameters: [
      {
        name: "kbId",
        type: "string" as const,
        description: "知识库 ID",
        required: true,
      },
      {
        name: "path",
        type: "string" as const,
        description: "要浏览的相对路径，默认为根目录",
        required: false,
      },
      {
        name: "depth",
        type: "number" as const,
        description: "递归深度，默认为 1（仅当前层级）",
        required: false,
      },
    ],
    async handler(params: Record<string, unknown>): Promise<FileEntry[]> {
      const kbId = params.kbId as string;
      const path = (params.path as string) ?? ".";
      const depth = (params.depth as number) ?? 1;

      return kbService.ls(kbId, path, Math.min(depth, 5), tenantId);
    },
  };
}
