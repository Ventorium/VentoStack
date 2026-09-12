import type { Migration } from '@ventostack/database';

/**
 * 统一数据范围编号：2=本部门，3=本部门及以下。
 * 旧实现的 2/3 含义相反，使用单条 CASE 原子交换，避免临时值与脏数据冲突。
 */
export const normalizeDataScope: Migration = {
  name: '014_normalize_data_scope',
  async up(executor) {
    await executor(`
      UPDATE sys_role
      SET data_scope = CASE
        WHEN data_scope = 2 THEN 3
        WHEN data_scope = 3 THEN 2
        WHEN data_scope IS NULL THEN 4
        ELSE data_scope
      END
      WHERE data_scope IN (2, 3) OR data_scope IS NULL
    `);
  },
  async down(executor) {
    await executor(`
      UPDATE sys_role
      SET data_scope = CASE
        WHEN data_scope = 2 THEN 3
        WHEN data_scope = 3 THEN 2
        ELSE data_scope
      END
      WHERE data_scope IN (2, 3)
    `);
  },
};
