import type { Migration } from "@ventostack/database";

export const addPasswordChangedAt: Migration = {
  name: "003_password_changed_at",

  async up(executor) {
    await executor(`ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP`);
    // 回填现有用户的 password_changed_at = created_at，避免立即过期
    await executor(
      `UPDATE sys_user SET password_changed_at = created_at WHERE password_changed_at IS NULL`,
    );
  },

  async down(executor) {
    await executor(`ALTER TABLE sys_user DROP COLUMN IF EXISTS password_changed_at`);
  },
};
