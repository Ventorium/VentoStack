import type { Migration } from '@ventostack/database';

export const addLoginMethodColumn: Migration = {
  name: '005_login_method_column',

  async up(executor) {
    await executor(`ALTER TABLE sys_login_log ADD COLUMN IF NOT EXISTS login_method VARCHAR(32) DEFAULT 'password'`);
  },

  async down(executor) {
    await executor(`ALTER TABLE sys_login_log DROP COLUMN IF EXISTS login_method`);
  },
};
