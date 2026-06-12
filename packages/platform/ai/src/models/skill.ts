import { column, defineModel } from "@ventostack/database";

export const AiSkillModel = defineModel(
  "ai_skill",
  {
    id: column.varchar({ primary: true, length: 36 }),
    slug: column.varchar({ length: 256 }),
    name: column.varchar({ length: 256 }),
    description: column.text({ nullable: true }),
    icon_url: column.varchar({ length: 1024, nullable: true }),
    source: column.varchar({ length: 32, default: "skillhub" }),
    source_url: column.varchar({ length: 1024, nullable: true }),
    latest_version: column.varchar({ length: 64, nullable: true }),
    installed_version: column.varchar({ length: 64, nullable: true }),
    changelog: column.text({ nullable: true }),
    file_tree: column.json({ nullable: true }),
    skill_md_content: column.text({ nullable: true }),
    readme_content: column.text({ nullable: true }),
    evaluation: column.json({ nullable: true }),
    security_reports: column.json({ nullable: true }),
    labels: column.json({ nullable: true }),
    stats: column.json({ nullable: true }),
    owner: column.json({ nullable: true }),
    enabled: column.boolean({ default: true }),
    installed_at: column.timestamp({ nullable: true }),
    last_synced_at: column.timestamp({ nullable: true }),
    tenant_id: column.varchar({ length: 36, default: "default" }),
  },
  { timestamps: true },
);

export const AiAgentSkillModel = defineModel(
  "ai_agent_skill",
  {
    id: column.varchar({ primary: true, length: 36 }),
    agent_id: column.varchar({ length: 36 }),
    skill_id: column.varchar({ length: 36 }),
    enabled: column.boolean({ default: true }),
    tenant_id: column.varchar({ length: 36, default: "default" }),
    created_at: column.timestamp({ default: "NOW" }),
  },
  { timestamps: false },
);
