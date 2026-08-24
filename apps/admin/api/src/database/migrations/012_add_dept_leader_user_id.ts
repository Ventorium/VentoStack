import type { Migration } from "@ventostack/database";

/**
 * 部门负责人从自由文本改为关联用户：
 * 新增 leader_user_id 列，并把已有 leader 文本按昵称/用户名回填为用户 ID。
 */
export const addDeptLeaderUserId: Migration = {
  name: "012_add_dept_leader_user_id",
  up: async (executor) => {
    await executor(`
      ALTER TABLE sys_dept ADD COLUMN IF NOT EXISTS leader_user_id VARCHAR(36)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_sys_dept_leader_user_id ON sys_dept (leader_user_id)
    `);

    // 存量数据回填：leader 文本与用户昵称或用户名一致时，转换为用户 ID
    await executor(`
      UPDATE sys_dept d
      SET leader_user_id = u.id
      FROM sys_user u
      WHERE d.leader IS NOT NULL
        AND d.leader <> ''
        AND d.leader_user_id IS NULL
        AND u.deleted_at IS NULL
        AND (u.nickname = d.leader OR u.username = d.leader)
    `);
  },
  down: async (executor) => {
    await executor(`DROP INDEX IF EXISTS idx_sys_dept_leader_user_id`);
    await executor(`ALTER TABLE sys_dept DROP COLUMN IF EXISTS leader_user_id`);
  },
};
