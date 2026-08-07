/**
 * AI Skill 管理表 + Agent/KB schema 扩展
 */
import type { Migration } from "@ventostack/database";

export const createAiSkillTables: Migration = {
  name: "006_create_ai_skill_tables",
  up: async (executor) => {
    // ── Skill 表 ──
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_skill (
        id VARCHAR(36) PRIMARY KEY,
        slug VARCHAR(256) NOT NULL,
        name VARCHAR(256) NOT NULL,
        description TEXT,
        icon_url VARCHAR(1024),
        source VARCHAR(32) NOT NULL DEFAULT 'skillhub',
        source_url VARCHAR(1024),
        latest_version VARCHAR(64),
        installed_version VARCHAR(64),
        changelog TEXT,
        file_tree JSON,
        skill_md_content TEXT,
        readme_content TEXT,
        evaluation JSON,
        security_reports JSON,
        labels JSON,
        stats JSON,
        owner JSON,
        enabled BOOLEAN DEFAULT TRUE,
        installed_at TIMESTAMP,
        last_synced_at TIMESTAMP,
        tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skill_slug_tenant
      ON ai_skill(slug, tenant_id)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_skill_source
      ON ai_skill(source, tenant_id)
    `);

    // ── Agent-Skill 关联表 ──
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_agent_skill (
        id VARCHAR(36) PRIMARY KEY,
        agent_id VARCHAR(36) NOT NULL REFERENCES ai_agent(id) ON DELETE CASCADE,
        skill_id VARCHAR(36) NOT NULL REFERENCES ai_skill(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT TRUE,
        tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_skill_unique
      ON ai_agent_skill(agent_id, skill_id)
    `);

    // ── Agent 表扩展 ──
    await executor(`
      ALTER TABLE ai_agent
      ADD COLUMN IF NOT EXISTS skill_ids JSON
    `);
    await executor(`
      ALTER TABLE ai_agent
      ADD COLUMN IF NOT EXISTS mcp_server_ids JSON
    `);
    await executor(`
      ALTER TABLE ai_agent
      ADD COLUMN IF NOT EXISTS model_overrides JSON
    `);

    // ── Knowledge Base 表扩展 scope ──
    await executor(`
      ALTER TABLE ai_knowledge_base
      ADD COLUMN IF NOT EXISTS scope VARCHAR(32) NOT NULL DEFAULT 'global'
    `);
    await executor(`
      ALTER TABLE ai_knowledge_base
      ADD COLUMN IF NOT EXISTS owner_id VARCHAR(36)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_kb_scope
      ON ai_knowledge_base(scope, tenant_id)
    `);
  },

  down: async (executor) => {
    await executor(`DROP TABLE IF EXISTS ai_agent_skill CASCADE`);
    await executor(`DROP TABLE IF EXISTS ai_skill CASCADE`);
  },
};
