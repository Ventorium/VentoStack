import type { Migration } from "@ventostack/database";

export const createOssTables: Migration = {
  name: "001_create_oss_tables",

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_oss_file (
        id VARCHAR(36) PRIMARY KEY,
        original_name VARCHAR(256) NOT NULL,
        storage_path VARCHAR(512) NOT NULL,
        size BIGINT NOT NULL,
        mime_type VARCHAR(128),
        extension VARCHAR(16),
        bucket VARCHAR(64) DEFAULT 'default',
        uploader_id VARCHAR(36),
        ref_count INT DEFAULT 0,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executor("CREATE INDEX IF NOT EXISTS idx_sys_oss_uploader ON sys_oss_file (uploader_id)");
    await executor("CREATE INDEX IF NOT EXISTS idx_sys_oss_bucket ON sys_oss_file (bucket)");
  },

  async down(executor) {
    await executor("DROP TABLE IF EXISTS sys_oss_file");
  },
};
