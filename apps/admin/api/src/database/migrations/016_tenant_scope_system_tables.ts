import type { Migration } from '@ventostack/database';

const SYSTEM_TABLES = [
  'sys_user',
  'sys_role',
  'sys_user_role',
  'sys_menu',
  'sys_role_menu',
  'sys_dept',
  'sys_post',
  'sys_user_post',
  'sys_dict_type',
  'sys_dict_data',
  'sys_config',
  'sys_notice',
  'sys_user_notice',
  'sys_login_log',
  'sys_operation_log',
  'sys_mfa_recovery',
  'sys_passkey',
  'sys_role_dept',
  'sys_tag',
  'sys_user_tag',
] as const;

/**
 * 为 Admin System 全部资源补齐租户归属。
 *
 * 存量数据归入 default tenant；上线前如需拆分多个租户，必须先执行业务映射，
 * 不得在本迁移后直接开放多租户流量。
 */
export const tenantScopeSystemTables: Migration = {
  name: '016_tenant_scope_system_tables',
  async up(executor) {
    for (const table of SYSTEM_TABLES) {
      await executor(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36)`);
      // IF NOT EXISTS 不会修复“列已存在但可空”的升级中间态，因此显式回填并重申约束。
      await executor(`UPDATE ${table} SET tenant_id = 'default' WHERE tenant_id IS NULL`);
      await executor(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET DEFAULT 'default'`);
      await executor(`ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL`);
      await executor(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant_id ON ${table} (tenant_id)`);
    }

    await executor('DROP INDEX IF EXISTS uq_sys_user_active_username');
    await executor(`
      CREATE UNIQUE INDEX uq_sys_user_tenant_active_username
      ON sys_user (tenant_id, lower(username)) WHERE deleted_at IS NULL
    `);

    const legacyConstraints = [
      ['sys_role', 'sys_role_code_key'],
      ['sys_post', 'sys_post_code_key'],
      ['sys_dict_type', 'sys_dict_type_code_key'],
      ['sys_config', 'sys_config_key_key'],
      ['sys_tag', 'sys_tag_code_key'],
      ['sys_dict_data', 'uq_dict_data_type_value'],
    ] as const;
    for (const [table, constraint] of legacyConstraints) {
      await executor(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
    }

    await executor('CREATE UNIQUE INDEX uq_sys_role_tenant_code ON sys_role (tenant_id, code)');
    await executor('CREATE UNIQUE INDEX uq_sys_post_tenant_code ON sys_post (tenant_id, code)');
    await executor(
      'CREATE UNIQUE INDEX uq_sys_dict_type_tenant_code ON sys_dict_type (tenant_id, code)',
    );
    await executor('CREATE UNIQUE INDEX uq_sys_config_tenant_key ON sys_config (tenant_id, key)');
    await executor('CREATE UNIQUE INDEX uq_sys_tag_tenant_code ON sys_tag (tenant_id, code)');
    await executor(
      'CREATE UNIQUE INDEX uq_sys_dict_data_tenant_type_value ON sys_dict_data (tenant_id, type_code, value)',
    );

    await executor(
      'CREATE UNIQUE INDEX uq_sys_user_role_tenant ON sys_user_role (tenant_id, user_id, role_id)',
    );
    await executor(
      'CREATE UNIQUE INDEX uq_sys_role_menu_tenant ON sys_role_menu (tenant_id, role_id, menu_id)',
    );
    await executor(
      'CREATE UNIQUE INDEX uq_sys_role_dept_tenant ON sys_role_dept (tenant_id, role_id, dept_id)',
    );
    await executor(
      'CREATE UNIQUE INDEX uq_sys_user_post_tenant ON sys_user_post (tenant_id, user_id, post_id)',
    );
    await executor(
      'CREATE UNIQUE INDEX uq_sys_user_tag_tenant ON sys_user_tag (tenant_id, user_id, tag_id)',
    );
    await executor(
      'CREATE UNIQUE INDEX uq_sys_user_notice_tenant ON sys_user_notice (tenant_id, user_id, notice_id)',
    );

    // 复合外键的被引用端必须具备相同列序的唯一键。资源 id 仍保持全局主键，
    // 这里额外的唯一索引用于让数据库验证“关联行和两端属于同一租户”。
    const tenantResourceTables = [
      'sys_user',
      'sys_role',
      'sys_menu',
      'sys_dept',
      'sys_post',
      'sys_notice',
      'sys_tag',
    ] as const;
    for (const table of tenantResourceTables) {
      await executor(`CREATE UNIQUE INDEX uq_${table}_tenant_id_id ON ${table} (tenant_id, id)`);
    }

    const tenantForeignKeys = [
      [
        'sys_user',
        'fk_sys_user_tenant_dept',
        '(tenant_id, dept_id)',
        'sys_dept(tenant_id, id)',
        'SET NULL (dept_id)',
      ],
      [
        'sys_dept',
        'fk_sys_dept_tenant_parent',
        '(tenant_id, parent_id)',
        'sys_dept(tenant_id, id)',
        'RESTRICT',
      ],
      [
        'sys_dept',
        'fk_sys_dept_tenant_leader',
        '(tenant_id, leader_user_id)',
        'sys_user(tenant_id, id)',
        'SET NULL (leader_user_id)',
      ],
      [
        'sys_menu',
        'fk_sys_menu_tenant_parent',
        '(tenant_id, parent_id)',
        'sys_menu(tenant_id, id)',
        'RESTRICT',
      ],
      [
        'sys_user_role',
        'fk_sys_user_role_tenant_user',
        '(tenant_id, user_id)',
        'sys_user(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_user_role',
        'fk_sys_user_role_tenant_role',
        '(tenant_id, role_id)',
        'sys_role(tenant_id, id)',
        'RESTRICT',
      ],
      [
        'sys_role_menu',
        'fk_sys_role_menu_tenant_role',
        '(tenant_id, role_id)',
        'sys_role(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_role_menu',
        'fk_sys_role_menu_tenant_menu',
        '(tenant_id, menu_id)',
        'sys_menu(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_role_dept',
        'fk_sys_role_dept_tenant_role',
        '(tenant_id, role_id)',
        'sys_role(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_role_dept',
        'fk_sys_role_dept_tenant_dept',
        '(tenant_id, dept_id)',
        'sys_dept(tenant_id, id)',
        'RESTRICT',
      ],
      [
        'sys_user_post',
        'fk_sys_user_post_tenant_user',
        '(tenant_id, user_id)',
        'sys_user(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_user_post',
        'fk_sys_user_post_tenant_post',
        '(tenant_id, post_id)',
        'sys_post(tenant_id, id)',
        'RESTRICT',
      ],
      [
        'sys_user_tag',
        'fk_sys_user_tag_tenant_user',
        '(tenant_id, user_id)',
        'sys_user(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_user_tag',
        'fk_sys_user_tag_tenant_tag',
        '(tenant_id, tag_id)',
        'sys_tag(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_user_notice',
        'fk_sys_user_notice_tenant_user',
        '(tenant_id, user_id)',
        'sys_user(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_user_notice',
        'fk_sys_user_notice_tenant_notice',
        '(tenant_id, notice_id)',
        'sys_notice(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_notice',
        'fk_sys_notice_tenant_publisher',
        '(tenant_id, publisher_id)',
        'sys_user(tenant_id, id)',
        'SET NULL (publisher_id)',
      ],
      [
        'sys_passkey',
        'fk_sys_passkey_tenant_user',
        '(tenant_id, user_id)',
        'sys_user(tenant_id, id)',
        'CASCADE',
      ],
      [
        'sys_mfa_recovery',
        'fk_sys_mfa_recovery_tenant_user',
        '(tenant_id, user_id)',
        'sys_user(tenant_id, id)',
        'CASCADE',
      ],
    ] as const;
    for (const [table, name, columns, target, onDelete] of tenantForeignKeys) {
      await executor(`
        ALTER TABLE ${table}
        ADD CONSTRAINT ${name} FOREIGN KEY ${columns} REFERENCES ${target} ON DELETE ${onDelete}
      `);
    }

    await executor(`
      ALTER TABLE sys_dict_data ADD CONSTRAINT fk_sys_dict_data_tenant_type
      FOREIGN KEY (tenant_id, type_code) REFERENCES sys_dict_type(tenant_id, code) ON DELETE CASCADE
    `);
  },
  async down(executor) {
    const tenantForeignKeys = [
      ['sys_dict_data', 'fk_sys_dict_data_tenant_type'],
      ['sys_mfa_recovery', 'fk_sys_mfa_recovery_tenant_user'],
      ['sys_passkey', 'fk_sys_passkey_tenant_user'],
      ['sys_notice', 'fk_sys_notice_tenant_publisher'],
      ['sys_user_notice', 'fk_sys_user_notice_tenant_notice'],
      ['sys_user_notice', 'fk_sys_user_notice_tenant_user'],
      ['sys_user_tag', 'fk_sys_user_tag_tenant_tag'],
      ['sys_user_tag', 'fk_sys_user_tag_tenant_user'],
      ['sys_user_post', 'fk_sys_user_post_tenant_post'],
      ['sys_user_post', 'fk_sys_user_post_tenant_user'],
      ['sys_role_dept', 'fk_sys_role_dept_tenant_dept'],
      ['sys_role_dept', 'fk_sys_role_dept_tenant_role'],
      ['sys_role_menu', 'fk_sys_role_menu_tenant_menu'],
      ['sys_role_menu', 'fk_sys_role_menu_tenant_role'],
      ['sys_user_role', 'fk_sys_user_role_tenant_role'],
      ['sys_user_role', 'fk_sys_user_role_tenant_user'],
      ['sys_menu', 'fk_sys_menu_tenant_parent'],
      ['sys_dept', 'fk_sys_dept_tenant_leader'],
      ['sys_dept', 'fk_sys_dept_tenant_parent'],
      ['sys_user', 'fk_sys_user_tenant_dept'],
    ] as const;
    for (const [table, name] of tenantForeignKeys) {
      await executor(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
    }
    const indexes = [
      'uq_sys_user_tenant_active_username',
      'uq_sys_role_tenant_code',
      'uq_sys_post_tenant_code',
      'uq_sys_dict_type_tenant_code',
      'uq_sys_config_tenant_key',
      'uq_sys_tag_tenant_code',
      'uq_sys_dict_data_tenant_type_value',
      'uq_sys_user_role_tenant',
      'uq_sys_role_menu_tenant',
      'uq_sys_role_dept_tenant',
      'uq_sys_user_post_tenant',
      'uq_sys_user_tag_tenant',
      'uq_sys_user_notice_tenant',
      'uq_sys_user_tenant_id_id',
      'uq_sys_role_tenant_id_id',
      'uq_sys_menu_tenant_id_id',
      'uq_sys_dept_tenant_id_id',
      'uq_sys_post_tenant_id_id',
      'uq_sys_notice_tenant_id_id',
      'uq_sys_tag_tenant_id_id',
    ];
    for (const index of indexes) await executor(`DROP INDEX IF EXISTS ${index}`);
    for (const table of [...SYSTEM_TABLES].reverse()) {
      await executor(`DROP INDEX IF EXISTS idx_${table}_tenant_id`);
      await executor(`ALTER TABLE ${table} DROP COLUMN IF EXISTS tenant_id`);
    }
    await executor(
      'CREATE UNIQUE INDEX uq_sys_user_active_username ON sys_user (lower(username)) WHERE deleted_at IS NULL',
    );
    const legacyConstraints = [
      ['sys_role', 'sys_role_code_key', 'code'],
      ['sys_post', 'sys_post_code_key', 'code'],
      ['sys_dict_type', 'sys_dict_type_code_key', 'code'],
      ['sys_config', 'sys_config_key_key', 'key'],
      ['sys_tag', 'sys_tag_code_key', 'code'],
      ['sys_dict_data', 'uq_dict_data_type_value', 'type_code, value'],
    ] as const;
    for (const [table, name, columns] of legacyConstraints) {
      await executor(`ALTER TABLE ${table} ADD CONSTRAINT ${name} UNIQUE (${columns})`);
    }
  },
};
