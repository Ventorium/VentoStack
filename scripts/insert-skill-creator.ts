import { Database } from "bun:sqlite";
import { randomUUID } from "crypto";

// Use bun's native postgres
const sql = new (Bun as any).sql("postgres://vento:ventostack@localhost:5432/ventostack");

async function main() {
  const adminRows = await sql`SELECT id FROM sys_user WHERE username = 'admin' LIMIT 1`;
  if (!adminRows.length) { console.log("admin user not found"); process.exit(1); }
  const adminId = adminRows[0].id;
  console.log("admin id:", adminId);

  const existing = await sql`SELECT id FROM ai_agent WHERE name = 'Skill Creator' AND tenant_id = 'default'`;
  if (existing.length) { console.log("already exists:", existing[0].id); process.exit(0); }

  const id = randomUUID();
  const tools = JSON.stringify(["web_search", "web_fetch", "file-read", "file-write", "ls", "cat", "find"]);
  const systemPrompt = [
    "You are a Skill Creator assistant. You help users create Skills (modular knowledge packages) for an AI agent system.",
    "",
    "A Skill consists of:",
    "- SKILL.md (required): YAML frontmatter with name + description, then markdown instructions",
    "- Optional: scripts/, references/, assets/ directories",
    "",
    "## Your Workflow",
    "1. Ask the user what kind of skill they want to create",
    "2. Ask clarifying questions if needed",
    "3. Use file-write tool to create files in the workspace directory",
    "4. Always create SKILL.md first with proper YAML frontmatter",
    "",
    "## SKILL.md Format",
    "```markdown",
    "---",
    "name: skill-name",
    "description: What this skill does and when to use it",
    "---",
    "# Skill Name",
    "Instructions for the AI agent on how to use this skill...",
    "```",
    "",
    "## Rules",
    "- Always use file-write tool to write files (not fenced code blocks)",
    `- Write ALL files to the workspace directory: ./data/skills/.workspace/${id}/`,
    `- Example: file-write path="./data/skills/.workspace/${id}/SKILL.md" content="..."`,
    "- Create SKILL.md with proper YAML frontmatter (name + description)",
    "- Be concise and ask one question at a time",
    '- When the user says "done" or "install", confirm all files are written',
    "- Use web-search and web-fetch to research topics when needed",
  ].join("\n");

  await sql`
    INSERT INTO ai_agent (id, name, description, system_prompt, model, tools, max_iterations, max_tokens_per_turn, tenant_id, created_by, status, is_public, created_at, updated_at)
    VALUES (${id}, 'Skill Creator', 'AI 技能创建助手，帮助你创建、编辑和导出 Skill', ${systemPrompt}, '', ${tools}, 10, 4096, 'default', ${adminId}, 'active', true, NOW(), NOW())
  `;
  console.log("inserted skill-creator agent:", id);
}

main().catch(console.error).finally(() => process.exit(0));
