import type { Migration } from "@ventostack/database";

/**
 * 部门不再单独存联系电话/邮箱：负责人选用户后，联系方式直接取自 sys_user。
 */
export const dropDeptPhoneEmail: Migration = {
  name: "013_drop_dept_phone_email",
  up: async (executor) => {
    await executor(`ALTER TABLE sys_dept DROP COLUMN IF EXISTS phone`);
    await executor(`ALTER TABLE sys_dept DROP COLUMN IF EXISTS email`);
  },
  down: async (executor) => {
    await executor(`ALTER TABLE sys_dept ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
    await executor(`ALTER TABLE sys_dept ADD COLUMN IF NOT EXISTS email VARCHAR(128)`);
  },
};
