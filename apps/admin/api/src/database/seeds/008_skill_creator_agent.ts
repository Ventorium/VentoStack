import { generateUUID } from "@ventostack/core";
import type { Seed } from "@ventostack/database";

/**
 * 预置 skill-creator 智能体
 * 具备 web-search、web-fetch、file-read、file-write 等能力
 * 用于在线创建 AI Skill
 * 幂等：如果已存在 name='Skill Creator' 的智能体则跳过。
 */
export const skillCreatorAgentSeed: Seed = {
  name: "008_skill_creator_agent",

  async run(executor) {
    // 幂等检查
    const existing = await executor(`SELECT id FROM ai_agent WHERE name = 'Skill Creator'`);
    if ((existing as unknown[]).length > 0) {
      return;
    }

    // 查询 admin 用户 ID
    const adminUser = await executor(`SELECT id FROM sys_user WHERE username = 'admin'`);
    const adminUserId = (adminUser as unknown as Array<{ id: string }>)?.[0]?.id;
    if (!adminUserId) return;

    const agentId = generateUUID();

    const systemPrompt = `You are a Skill Creator assistant. You help users create Skills (modular knowledge packages) for an AI agent system.

A Skill consists of:
- SKILL.md (required): YAML frontmatter with name + description, then markdown instructions
- Optional: scripts/, references/, assets/ directories

## Your Workflow

1. Ask the user what kind of skill they want to create
2. Ask clarifying questions if needed
3. Use file-write tool to create files in the workspace directory
4. Always create SKILL.md first with proper YAML frontmatter

## SKILL.md Format

\`\`\`markdown
---
name: skill-name
description: What this skill does and when to use it
---

# Skill Name

Instructions for the AI agent on how to use this skill...
\`\`\`

## Rules
- Always use file-write tool to write files (not fenced code blocks)
- Write ALL files to the workspace directory: ./data/skills/.workspace/${agentId}/
- Example: file-write path="./data/skills/.workspace/${agentId}/SKILL.md" content="..."
- Create SKILL.md with proper YAML frontmatter (name + description)
- Be concise and ask one question at a time
- When the user says "done" or "install", confirm all files are written
- Use web-search and web-fetch to research topics when needed`;

    const tools = JSON.stringify([
      "web_search",
      "web_fetch",
      "file-read",
      "file-write",
      "ls",
      "cat",
      "find",
    ]);

    await executor(
      `INSERT INTO ai_agent (id, name, description, system_prompt, model, tools, max_iterations, max_tokens_per_turn, tenant_id, created_by, status, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
      [
        agentId,
        "Skill Creator",
        "AI 技能创建助手，帮助你创建、编辑和导出 Skill",
        systemPrompt,
        "", // model 留空，由用户在对话时选择
        tools,
        10,
        4096,
        "", // tenant_id: 空字符串，与 TENANT_ENABLED=false 时的查询条件一致
        adminUserId,
        "active",
        true,
      ],
    );
  },
};
