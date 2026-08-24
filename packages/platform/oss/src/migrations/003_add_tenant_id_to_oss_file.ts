import type { Migration } from "@ventostack/database";

/** 为 oss 文件表补充租户边界：新增 tenant_id 列并建立索引 */
export const addTenantIdToOssFile: Migration = {
  name: "003_add_tenant_id_to_oss_file",

  async up(executor) {
    // 历史数据统一归入 default 租户
    await executor(`
      ALTER TABLE sys_oss_file
      ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'default'
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_sys_oss_tenant ON sys_oss_file (tenant_id)
    `);
  },

  async down(executor) {
    await executor("DROP INDEX IF EXISTS idx_sys_oss_tenant");

    await executor(`
      ALTER TABLE sys_oss_file
      DROP COLUMN IF EXISTS tenant_id
    `);
  },
};
