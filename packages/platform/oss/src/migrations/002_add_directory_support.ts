import type { Migration } from "@ventostack/database";

export const addDirectorySupport: Migration = {
  name: "002_add_directory_support",

  async up(executor) {
    // Add directory support columns
    await executor(`
      ALTER TABLE sys_oss_file 
      ADD COLUMN IF NOT EXISTS parent_id VARCHAR(36),
      ADD COLUMN IF NOT EXISTS is_directory BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS path VARCHAR(512) DEFAULT '/'
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_sys_oss_parent ON sys_oss_file (parent_id)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_sys_oss_path ON sys_oss_file (path)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_sys_oss_directory ON sys_oss_file (is_directory)
    `);
  },

  async down(executor) {
    await executor(`
      ALTER TABLE sys_oss_file 
      DROP COLUMN IF EXISTS parent_id,
      DROP COLUMN IF EXISTS is_directory,
      DROP COLUMN IF EXISTS path
    `);
  },
};
