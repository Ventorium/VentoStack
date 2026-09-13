import type { Migration } from '@ventostack/database';

/** 为存量操作日志表补充客户端位置描述字段。 */
export const addOperationLogLocation: Migration = {
  name: '017_operation_log_location',
  async up(executor) {
    await executor('ALTER TABLE sys_operation_log ADD COLUMN IF NOT EXISTS location VARCHAR(128)');
  },
  async down(executor) {
    await executor('ALTER TABLE sys_operation_log DROP COLUMN IF EXISTS location');
  },
};
