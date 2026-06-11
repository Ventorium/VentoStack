/**
 * 创建 AI 知识库相关表
 * 本地文件目录模式，无需 pgvector
 */
import type { Migration } from "@ventostack/database";

export const createAiKnowledgeTables: Migration = {
  name: "003_create_ai_knowledge_tables",
  up: async (executor) => {
    // 知识库表
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_knowledge_base (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        base_path VARCHAR(512) NOT NULL,
        tenant_id VARCHAR(36) NOT NULL,
        created_by VARCHAR(36) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        file_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 文件映射表（源文件 → md 文件追踪链）
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_file_mapping (
        id VARCHAR(36) PRIMARY KEY,
        knowledge_base_id VARCHAR(36) NOT NULL REFERENCES ai_knowledge_base(id) ON DELETE CASCADE,
        source_path VARCHAR(512),
        content_path VARCHAR(512) NOT NULL,
        title VARCHAR(255) NOT NULL,
        parser VARCHAR(32),
        source_size BIGINT,
        content_size BIGINT,
        parsed_at TIMESTAMP,
        tenant_id VARCHAR(36) NOT NULL,
        created_by VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 索引
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_fm_kb
      ON ai_file_mapping(knowledge_base_id, tenant_id)
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_fm_content
      ON ai_file_mapping(knowledge_base_id, content_path)
    `);
  },

  down: async (executor) => {
    await executor("DROP TABLE IF EXISTS ai_file_mapping CASCADE");
    await executor("DROP TABLE IF EXISTS ai_knowledge_base CASCADE");
  },
};
