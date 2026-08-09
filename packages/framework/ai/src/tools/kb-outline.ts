/**
 * 知识库 Markdown 大纲工具
 * 提取 markdown 文件的标题大纲（# ~ ####），供 Agent 自主导航定位章节，
 * 配合 kb-browse（目录树）与 kb-read（读取全文）完成基于 markdown 的自主搜索。
 */
import type { KnowledgeBaseService, MarkdownOutlineEntry } from '../knowledge-base/types';

export interface KBOutlineToolDeps {
  kbService: KnowledgeBaseService;
  tenantId: string;
}

export function createKBOutlineTool(deps: KBOutlineToolDeps) {
  const { kbService, tenantId } = deps;

  return {
    name: 'kb-outline',
    description:
      '查看知识库中某个 markdown 文件的标题大纲（章节结构）。先浏览目录（kb-browse）定位文件，再用本工具了解章节，最后用 kb-read 读取对应内容。',
    parameters: [
      {
        name: 'kbId',
        type: 'string' as const,
        description: '知识库 ID',
        required: true,
      },
      {
        name: 'path',
        type: 'string' as const,
        description: 'markdown 文件的相对路径（如 docs/guide.md）',
        required: true,
      },
    ],
    async handler(params: Record<string, unknown>): Promise<MarkdownOutlineEntry[]> {
      const kbId = params.kbId as string;
      const path = params.path as string;

      return kbService.outline(kbId, path, tenantId);
    },
  };
}
