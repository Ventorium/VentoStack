import type { Migration } from '@ventostack/database';

/** 为用户体系补齐唯一性和关系完整性约束；发现历史脏数据时拒绝静默迁移。 */
export const hardenIdentityIntegrity: Migration = {
  name: '015_harden_identity_integrity',
  async up(executor) {
    await executor(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM sys_user WHERE deleted_at IS NULL
          GROUP BY lower(username) HAVING count(*) > 1
        ) THEN
          RAISE EXCEPTION 'duplicate active usernames must be resolved before migration 015';
        END IF;
      END $$
    `);
    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_active_username
      ON sys_user (lower(username)) WHERE deleted_at IS NULL
    `);
    await executor(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM sys_user u LEFT JOIN sys_dept d ON d.id = u.dept_id WHERE u.dept_id IS NOT NULL AND d.id IS NULL)
          OR EXISTS (SELECT 1 FROM sys_dept c LEFT JOIN sys_dept p ON p.id = c.parent_id WHERE c.parent_id IS NOT NULL AND p.id IS NULL)
          OR EXISTS (SELECT 1 FROM sys_dept d LEFT JOIN sys_user u ON u.id = d.leader_user_id WHERE d.leader_user_id IS NOT NULL AND u.id IS NULL)
          OR EXISTS (SELECT 1 FROM sys_menu c LEFT JOIN sys_menu p ON p.id = c.parent_id WHERE c.parent_id IS NOT NULL AND p.id IS NULL)
          OR EXISTS (SELECT 1 FROM sys_user_role x LEFT JOIN sys_user u ON u.id = x.user_id LEFT JOIN sys_role r ON r.id = x.role_id WHERE u.id IS NULL OR r.id IS NULL)
          OR EXISTS (SELECT 1 FROM sys_role_menu x LEFT JOIN sys_role r ON r.id = x.role_id LEFT JOIN sys_menu m ON m.id = x.menu_id WHERE r.id IS NULL OR m.id IS NULL)
          OR EXISTS (SELECT 1 FROM sys_role_dept x LEFT JOIN sys_role r ON r.id = x.role_id LEFT JOIN sys_dept d ON d.id = x.dept_id WHERE r.id IS NULL OR d.id IS NULL)
          OR EXISTS (SELECT 1 FROM sys_user_post x LEFT JOIN sys_user u ON u.id = x.user_id LEFT JOIN sys_post p ON p.id = x.post_id WHERE u.id IS NULL OR p.id IS NULL)
        THEN
          RAISE EXCEPTION 'orphaned identity relations must be resolved before migration 015';
        END IF;
      END $$
    `);

    const constraints = [
      [
        'sys_user',
        'fk_sys_user_dept',
        'FOREIGN KEY (dept_id) REFERENCES sys_dept(id) ON DELETE SET NULL',
      ],
      [
        'sys_dept',
        'fk_sys_dept_parent',
        'FOREIGN KEY (parent_id) REFERENCES sys_dept(id) ON DELETE RESTRICT',
      ],
      [
        'sys_dept',
        'fk_sys_dept_leader',
        'FOREIGN KEY (leader_user_id) REFERENCES sys_user(id) ON DELETE SET NULL',
      ],
      [
        'sys_menu',
        'fk_sys_menu_parent',
        'FOREIGN KEY (parent_id) REFERENCES sys_menu(id) ON DELETE RESTRICT',
      ],
      [
        'sys_user_role',
        'fk_sys_user_role_user',
        'FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE',
      ],
      [
        'sys_user_role',
        'fk_sys_user_role_role',
        'FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE RESTRICT',
      ],
      [
        'sys_role_menu',
        'fk_sys_role_menu_role',
        'FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE CASCADE',
      ],
      [
        'sys_role_menu',
        'fk_sys_role_menu_menu',
        'FOREIGN KEY (menu_id) REFERENCES sys_menu(id) ON DELETE CASCADE',
      ],
      [
        'sys_role_dept',
        'fk_sys_role_dept_role',
        'FOREIGN KEY (role_id) REFERENCES sys_role(id) ON DELETE CASCADE',
      ],
      [
        'sys_role_dept',
        'fk_sys_role_dept_dept',
        'FOREIGN KEY (dept_id) REFERENCES sys_dept(id) ON DELETE RESTRICT',
      ],
      [
        'sys_user_post',
        'fk_sys_user_post_user',
        'FOREIGN KEY (user_id) REFERENCES sys_user(id) ON DELETE CASCADE',
      ],
      [
        'sys_user_post',
        'fk_sys_user_post_post',
        'FOREIGN KEY (post_id) REFERENCES sys_post(id) ON DELETE RESTRICT',
      ],
    ] as const;

    for (const [table, name, definition] of constraints) {
      await executor(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
            ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition};
          END IF;
        END $$
      `);
    }
  },
  async down(executor) {
    const constraints = [
      ['sys_user', 'fk_sys_user_dept'],
      ['sys_dept', 'fk_sys_dept_parent'],
      ['sys_dept', 'fk_sys_dept_leader'],
      ['sys_menu', 'fk_sys_menu_parent'],
      ['sys_user_role', 'fk_sys_user_role_user'],
      ['sys_user_role', 'fk_sys_user_role_role'],
      ['sys_role_menu', 'fk_sys_role_menu_role'],
      ['sys_role_menu', 'fk_sys_role_menu_menu'],
      ['sys_role_dept', 'fk_sys_role_dept_role'],
      ['sys_role_dept', 'fk_sys_role_dept_dept'],
      ['sys_user_post', 'fk_sys_user_post_user'],
      ['sys_user_post', 'fk_sys_user_post_post'],
    ] as const;
    for (const [table, name] of constraints) {
      await executor(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
    }
    await executor('DROP INDEX IF EXISTS uq_sys_user_active_username');
  },
};
