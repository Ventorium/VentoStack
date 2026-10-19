/**
 * AI 专家管理注册表
 *
 * 专家数据（prompt 正文 + 元数据）全部文件化存储在数据目录，
 * 本表仅记录管理信息：有哪些 / 下载了哪些 / 版本 / 扫描状态 / 启用状态。
 */
import type { Migration } from '@ventostack/database';

export const createAiExpertTables: Migration = {
  name: '018_create_ai_expert_tables',
  up: async (executor) => {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_expert (
        id VARCHAR(36) PRIMARY KEY,
        slug VARCHAR(128) NOT NULL,
        category_id VARCHAR(64),
        name VARCHAR(256) NOT NULL,
        description TEXT,
        latest_version VARCHAR(64),
        installed_version VARCHAR(64),
        content_sha256 VARCHAR(64),
        file_path VARCHAR(512) NOT NULL,
        scan_status VARCHAR(16) NOT NULL DEFAULT 'pending',
        scan_report JSON,
        remote_updated_at TIMESTAMP,
        enabled BOOLEAN DEFAULT TRUE,
        installed_at TIMESTAMP,
        last_synced_at TIMESTAMP,
        tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_expert_slug_tenant
      ON ai_expert(slug, tenant_id)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_expert_tenant_cat
      ON ai_expert(tenant_id, category_id)
    `);
  },

  down: async (executor) => {
    await executor('DROP TABLE IF EXISTS ai_expert CASCADE');
  },
};
