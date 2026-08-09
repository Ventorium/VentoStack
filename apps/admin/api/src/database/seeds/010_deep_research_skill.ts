import { generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';

/**
 * 内置 deep-research 技能种子（幂等）
 * 以 ai_skill 表记录形式提供「深度研究」技能，供 DeepResearch 类 Agent 绑定使用。
 * 若已存在 slug='deep-research' 且 tenant_id='default' 的记录则跳过。
 */
export const addDeepResearchSkillSeed: Seed = {
  name: '010_deep_research_skill',

  async run(executor) {
    const existing = await executor(
      `SELECT id FROM ai_skill WHERE slug = 'deep-research' AND tenant_id = 'default'`,
    );
    if ((existing as unknown[]).length > 0) {
      return;
    }

    const skillMd = `---
name: deep-research
description: 多轮深度研究技能：规划子问题、多源检索、交叉验证、输出带引用的结构化研究报告
---

# 深度研究（Deep Research）

当用户提出需要多轮调研、对比、分析的问题时，以资深研究员身份执行研究，产出可信、可溯源的结构化报告。

## 执行流程

1. **规划**：把研究问题拆解为 3-6 个子问题，列出每个子问题的检索关键词与期望来源类型（官方文档、权威媒体、一手数据、社区实践等）。
2. **检索**：对每个子问题使用 web_search 多轮检索（每轮覆盖多个关键词），并用 web_fetch 阅读权威来源原文，不要只依赖搜索结果摘要。
3. **交叉验证**：对比不同来源的信息，识别共识与矛盾；对矛盾信息标注可信度并说明依据。
4. **迭代**：对证据不足的子问题继续检索，直到所有子问题都有足够依据；必要时用知识库工具（kb-search）补充内部资料。
5. **产出**：输出结构化研究报告：摘要 → 分节正文（每个结论注明来源）→ 结论与建议 → 引用来源清单（名称 + URL）。

## 质量要求

- 优先使用一手来源（官方文档、原始论文、官方公告），二手来源（媒体报道、博客）仅作交叉验证。
- 对无法核实的信息明确标注"未能核实"，禁止编造来源。
- 信息以时间线/对比表等形式呈现更佳。
- 报告用中文撰写（除非用户要求其他语言）。
`;

    const now = new Date().toISOString();
    await executor(
      `INSERT INTO ai_skill (
         id, slug, name, description, source, source_url,
         latest_version, installed_version, skill_md_content, readme_content,
         labels, enabled, installed_at, last_synced_at, tenant_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'builtin', NULL,
         '1.0.0', '1.0.0', $5, $5,
         $6, TRUE, $7, $7, 'default', $7, $7)`,
      [
        generateUUID(),
        'deep-research',
        '深度研究',
        '多轮深度研究：规划、多源检索、交叉验证，输出带引用的结构化报告',
        skillMd,
        JSON.stringify(['research', 'builtin', 'web']),
        now,
      ],
    );
  },
};
