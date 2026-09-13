import type { Migration } from '@ventostack/database';

/** 字典类型公开读取策略；存量和新增字典均默认不可公开访问。 */
export const addDictPublicAccess: Migration = {
  name: '018_dict_public_access',
  async up(executor) {
    await executor(
      'ALTER TABLE sys_dict_type ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE',
    );
    await executor('UPDATE sys_dict_type SET is_public = FALSE WHERE is_public IS NULL');
    await executor('ALTER TABLE sys_dict_type ALTER COLUMN is_public SET DEFAULT FALSE');
    await executor('ALTER TABLE sys_dict_type ALTER COLUMN is_public SET NOT NULL');
  },
  async down(executor) {
    await executor('ALTER TABLE sys_dict_type DROP COLUMN IF EXISTS is_public');
  },
};
