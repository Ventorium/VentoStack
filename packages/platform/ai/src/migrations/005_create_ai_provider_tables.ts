/**
 * AI 模型供应商与模型管理表
 */
import type { Migration } from "@ventostack/database";

export const createAiProviderTables: Migration = {
  name: "005_create_ai_provider_tables",
  up: async (executor) => {
    // 供应商表
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_provider (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        display_name VARCHAR(128),
        api_format VARCHAR(32) NOT NULL DEFAULT 'openai_chat',
        base_url VARCHAR(512) NOT NULL,
        api_key VARCHAR(512) NOT NULL,
        headers JSON,
        extra JSON,
        preset_id VARCHAR(64),
        status SMALLINT DEFAULT 1,
        sort INT DEFAULT 0,
        tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 模型表
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_model (
        id VARCHAR(36) PRIMARY KEY,
        provider_id VARCHAR(36) NOT NULL REFERENCES ai_provider(id) ON DELETE CASCADE,
        model_id VARCHAR(256) NOT NULL,
        display_name VARCHAR(256),
        context_length INT DEFAULT 128000,
        max_output_tokens INT DEFAULT 4096,
        supports_text BOOLEAN DEFAULT TRUE,
        supports_image BOOLEAN DEFAULT FALSE,
        supports_video BOOLEAN DEFAULT FALSE,
        supports_audio BOOLEAN DEFAULT FALSE,
        supports_function_calling BOOLEAN DEFAULT FALSE,
        supports_streaming BOOLEAN DEFAULT TRUE,
        supports_thinking BOOLEAN DEFAULT FALSE,
        pricing_input DOUBLE PRECISION,
        pricing_output DOUBLE PRECISION,
        auto_fetched BOOLEAN DEFAULT FALSE,
        status SMALLINT DEFAULT 1,
        sort INT DEFAULT 0,
        tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_model_provider
      ON ai_model(provider_id)
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_model_provider_model
      ON ai_model(provider_id, model_id)
    `);

    // AI 全局配置表（key-value）
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_config (
        config_key VARCHAR(128) PRIMARY KEY,
        config_value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 给 ai_conversation 添加 model_id 字段
    await executor(`
      ALTER TABLE ai_conversation
      ADD COLUMN IF NOT EXISTS model_id VARCHAR(256)
    `);
  },
  down: async (executor) => {
    await executor(`DROP TABLE IF EXISTS ai_config`);
    await executor(`DROP TABLE IF EXISTS ai_model`);
    await executor(`DROP TABLE IF EXISTS ai_provider`);
  },
};
