/**
 * 知识库文件读取工具
 * 读取指定文件的完整内容，供 LLM 获取知识
 */
import type { KnowledgeBaseService, FileContent } from "../knowledge-base/types";

export interface KBReadToolDeps {
  kbService: KnowledgeBaseService;
  tenantId: string;
}

export function createKBReadTool(deps: KBReadToolDeps) {
  const { kbService, tenantId } = deps;

  return {
    name: "kb-read",
    description: "读取知识库中指定文件的完整内容，包括 frontmatter 和 wiki links。",
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
        description: "文件的相对路径",
        required: true,
      },
    ],
    async handler(params: Record<string, unknown>): Promise<FileContent | { error: string }> {
      const kbId = params.kbId as string;
      const path = params.path as string;

      const result = await kbService.cat(kbId, path, tenantId);
      if (!result) {
        return { error: `文件不存在: ${path}` };
      }
      return result;
    },
  };
}
