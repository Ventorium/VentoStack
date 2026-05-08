import type { Migration } from "@ventostack/database";

export const createRoleDeptTable: Migration = {
  name: "007_create_role_dept_table",

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_role_dept (
        role_id VARCHAR(36) NOT NULL,
        dept_id VARCHAR(36) NOT NULL,
        PRIMARY KEY (role_id, dept_id)
      )
    `);

    await executor("CREATE INDEX IF NOT EXISTS idx_sys_role_dept_dept_id ON sys_role_dept (dept_id)");
  },

  async down(executor) {
    await executor("DROP TABLE IF EXISTS sys_role_dept");
  },
};
