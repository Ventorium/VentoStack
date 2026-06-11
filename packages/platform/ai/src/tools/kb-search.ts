/**
 * 知识库全文搜索工具
 * 使用 PostgreSQL 全文搜索或本地 grep 搜索知识库内容
 */
import type { KnowledgeBaseService, SearchResult } from "../knowledge-base/types";

export interface KBSearchToolDeps {
  kbService: KnowledgeBaseService;
  tenantId: string;
}

export function createKBSearchTool(deps: KBSearchToolDeps) {
  const { kbService, tenantId } = deps;

  return {
    name: "kb-search",
    description: "在知识库中按关键词搜索文件内容。返回匹配的文件路径、标题、相关片段和评分。",
    parameters: [
      {
        name: "kbId",
        type: "string" as const,
        description: "知识库 ID",
        required: true,
      },
      {
        name: "query",
        type: "string" as const,
        description: "搜索关键词",
        required: true,
      },
      {
        name: "limit",
        type: "number" as const,
        description: "返回结果数量上限，默认 10",
        required: false,
      },
    ],
    async handler(params: Record<string, unknown>): Promise<SearchResult[]> {
      const kbId = params.kbId as string;
      const query = params.query as string;
      const limit = Math.min((params.limit as number) ?? 10, 50);

      if (!query || query.trim().length === 0) {
        return [];
      }

      return kbService.grep(kbId, query, undefined, tenantId, limit);
    },
  };
}
