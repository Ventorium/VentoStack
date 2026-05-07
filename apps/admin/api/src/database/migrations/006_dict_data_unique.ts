import type { Migration } from '@ventostack/database';

export const addDictDataUnique: Migration = {
  name: '006_dict_data_unique',

  async up(executor) {
    // 清理重复的 dict_data：保留每组 (type_code, value) 中 sort 最小（即最早插入）的那条
    await executor(`
      DELETE FROM sys_dict_data
      WHERE id NOT IN (
        SELECT MIN(id) FROM sys_dict_data GROUP BY type_code, value
      )
    `);

    // 添加唯一约束
    await executor(`
      ALTER TABLE sys_dict_data
      ADD CONSTRAINT uq_dict_data_type_value UNIQUE (type_code, value)
    `);
  },

  async down(executor) {
    await executor(`
      ALTER TABLE sys_dict_data
      DROP CONSTRAINT IF EXISTS uq_dict_data_type_value
    `);
  },
};
