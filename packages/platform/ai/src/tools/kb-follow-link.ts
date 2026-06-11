/**
 * 知识库 wiki link 追踪工具
 * 追踪 [[wiki link]] 引用，读取目标文件内容
 */
import type { KnowledgeBaseService, FileContent } from "../knowledge-base/types";

export interface KBFollowLinkToolDeps {
  kbService: KnowledgeBaseService;
  tenantId: string;
}

export function createKBFollowLinkTool(deps: KBFollowLinkToolDeps) {
  const { kbService, tenantId } = deps;

  return {
    name: "kb-follow-link",
    description: "追踪知识库中的 [[wiki link]] 引用，读取链接目标文件的内容。",
    parameters: [
      {
        name: "kbId",
        type: "string" as const,
        description: "知识库 ID",
        required: true,
      },
      {
        name: "link",
        type: "string" as const,
        description: "wiki link 目标（不含双方括号）",
        required: true,
      },
    ],
    async handler(params: Record<string, unknown>): Promise<FileContent | { error: string }> {
      const kbId = params.kbId as string;
      const link = params.link as string;

      // 将 link 转换为文件路径
      // [[Some Page]] → some-page.md 或 Some Page.md
      const normalizedLink = link.replace(/^\[\[|\]\]$/g, "").trim();
      if (!normalizedLink) {
        return { error: "链接为空" };
      }

      // 尝试直接查找
      const possiblePaths = [
        `${normalizedLink}.md`,
        `${normalizedLink.toLowerCase().replace(/\s+/g, "-")}.md`,
        normalizedLink,
      ];

      for (const path of possiblePaths) {
        const result = await kbService.cat(kbId, path, tenantId);
        if (result) return result;
      }

      // 尝试 grep 搜索链接标题
      const searchResults = await kbService.grep(kbId, normalizedLink, undefined, tenantId, 1);
      if (searchResults.length > 0) {
        const result = await kbService.cat(kbId, searchResults[0].path, tenantId);
        if (result) return result;
      }

      return { error: `未找到链接目标: ${normalizedLink}` };
    },
  };
}
