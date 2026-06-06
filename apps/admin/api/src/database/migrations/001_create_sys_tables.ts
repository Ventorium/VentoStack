import type { Migration } from "@ventostack/database";

export const createSysTables: Migration = {
  name: "001_create_sys_tables",

  async up(executor) {
    // sys_user
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_user (
        id VARCHAR(36) PRIMARY KEY,
        username VARCHAR(64) NOT NULL,
        password_hash VARCHAR(128) NOT NULL,
        nickname VARCHAR(64),
        email VARCHAR(128),
        phone VARCHAR(20),
        avatar VARCHAR(512),
        gender INT DEFAULT 0,
        status INT DEFAULT 1,
        dept_id VARCHAR(36),
        mfa_enabled BOOLEAN DEFAULT FALSE,
        mfa_secret VARCHAR(64),
        login_attempts INT DEFAULT 0,
        locked_until TIMESTAMP,
        blacklisted BOOLEAN DEFAULT FALSE,
        remark VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    // sys_role
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_role (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        sort INT DEFAULT 0,
        data_scope INT,
        status INT DEFAULT 1,
        remark VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    // sys_user_role
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_user_role (
        user_id VARCHAR(36) NOT NULL,
        role_id VARCHAR(36) NOT NULL,
        PRIMARY KEY (user_id, role_id)
      )
    `);

    // sys_menu
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_menu (
        id VARCHAR(36) PRIMARY KEY,
        parent_id VARCHAR(36),
        name VARCHAR(64) NOT NULL,
        path VARCHAR(256),
        component VARCHAR(256),
        redirect VARCHAR(256),
        type INT DEFAULT 1,
        permission VARCHAR(128),
        icon VARCHAR(64),
        sort INT DEFAULT 0,
        visible BOOLEAN DEFAULT TRUE,
        status INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // sys_role_menu
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_role_menu (
        role_id VARCHAR(36) NOT NULL,
        menu_id VARCHAR(36) NOT NULL,
        PRIMARY KEY (role_id, menu_id)
      )
    `);

    // sys_dept
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_dept (
        id VARCHAR(36) PRIMARY KEY,
        parent_id VARCHAR(36),
        name VARCHAR(64) NOT NULL,
        sort INT DEFAULT 0,
        leader VARCHAR(64),
        phone VARCHAR(20),
        email VARCHAR(128),
        status INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    // sys_post
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_post (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        sort INT DEFAULT 0,
        status INT DEFAULT 1,
        remark VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    // sys_user_post
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_user_post (
        user_id VARCHAR(36) NOT NULL,
        post_id VARCHAR(36) NOT NULL,
        PRIMARY KEY (user_id, post_id)
      )
    `);

    // sys_dict_type
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_dict_type (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(64) NOT NULL,
        code VARCHAR(64) NOT NULL UNIQUE,
        status INT DEFAULT 1,
        remark VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // sys_dict_data
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_dict_data (
        id VARCHAR(36) PRIMARY KEY,
        type_code VARCHAR(64) NOT NULL,
        label VARCHAR(128) NOT NULL,
        value VARCHAR(128) NOT NULL,
        sort INT DEFAULT 0,
        css_class VARCHAR(64),
        status INT DEFAULT 1,
        remark VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // sys_config
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_config (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        key VARCHAR(128) NOT NULL UNIQUE,
        value TEXT NOT NULL,
        type INT,
        "group" VARCHAR(64),
        remark VARCHAR(512),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // sys_notice
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_notice (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(256) NOT NULL,
        content TEXT NOT NULL,
        type INT DEFAULT 1,
        status INT DEFAULT 0,
        publisher_id VARCHAR(36),
        publish_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      )
    `);

    // sys_user_notice
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_user_notice (
        user_id VARCHAR(36) NOT NULL,
        notice_id VARCHAR(36) NOT NULL,
        read_at TIMESTAMP,
        PRIMARY KEY (user_id, notice_id)
      )
    `);

    // sys_login_log
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_login_log (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        username VARCHAR(64) NOT NULL,
        ip VARCHAR(45) NOT NULL,
        location VARCHAR(128),
        browser VARCHAR(64),
        os VARCHAR(64),
        status INT DEFAULT 0,
        message VARCHAR(512),
        login_method VARCHAR(32) DEFAULT 'password',
        login_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // sys_operation_log
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_operation_log (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        username VARCHAR(64) NOT NULL,
        module VARCHAR(64) NOT NULL,
        action VARCHAR(64) NOT NULL,
        method VARCHAR(10) NOT NULL,
        url VARCHAR(512) NOT NULL,
        ip VARCHAR(45) NOT NULL,
        params TEXT,
        result INT,
        error_msg TEXT,
        duration INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // sys_mfa_recovery
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_mfa_recovery (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        code_hash VARCHAR(128) NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes for foreign key lookups and common queries
    await executor("CREATE INDEX IF NOT EXISTS idx_sys_user_username ON sys_user (username)");
    await executor("CREATE INDEX IF NOT EXISTS idx_sys_user_dept_id ON sys_user (dept_id)");
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_user_role_role_id ON sys_user_role (role_id)",
    );
    await executor("CREATE INDEX IF NOT EXISTS idx_sys_menu_parent_id ON sys_menu (parent_id)");
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_role_menu_role_id ON sys_role_menu (role_id)",
    );
    await executor("CREATE INDEX IF NOT EXISTS idx_sys_dept_parent_id ON sys_dept (parent_id)");
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_dict_data_type_code ON sys_dict_data (type_code)",
    );
    await executor("CREATE INDEX IF NOT EXISTS idx_sys_config_key ON sys_config (key)");
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_login_log_user_id ON sys_login_log (user_id)",
    );
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_operation_log_user_id ON sys_operation_log (user_id)",
    );
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_mfa_recovery_user_id ON sys_mfa_recovery (user_id)",
    );
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_sys_user_notice_user_id ON sys_user_notice (user_id)",
    );
  },

  async down(executor) {
    // Drop in reverse order (dependent tables first)
    await executor("DROP TABLE IF EXISTS sys_mfa_recovery");
    await executor("DROP TABLE IF EXISTS sys_operation_log");
    await executor("DROP TABLE IF EXISTS sys_login_log");
    await executor("DROP TABLE IF EXISTS sys_user_notice");
    await executor("DROP TABLE IF EXISTS sys_notice");
    await executor("DROP TABLE IF EXISTS sys_config");
    await executor("DROP TABLE IF EXISTS sys_dict_data");
    await executor("DROP TABLE IF EXISTS sys_dict_type");
    await executor("DROP TABLE IF EXISTS sys_user_post");
    await executor("DROP TABLE IF EXISTS sys_post");
    await executor("DROP TABLE IF EXISTS sys_dept");
    await executor("DROP TABLE IF EXISTS sys_role_menu");
    await executor("DROP TABLE IF EXISTS sys_menu");
    await executor("DROP TABLE IF EXISTS sys_user_role");
    await executor("DROP TABLE IF EXISTS sys_role");
    await executor("DROP TABLE IF EXISTS sys_user");
  },
};
