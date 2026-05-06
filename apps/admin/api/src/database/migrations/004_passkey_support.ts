import type { Migration } from '@ventostack/database';

export const addPasskeySupport: Migration = {
  name: '004_passkey_support',
  async up(executor) {
    // 通行密钥表
    await executor(`
      CREATE TABLE IF NOT EXISTS sys_passkey (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        name VARCHAR(128) NOT NULL,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports TEXT,
        device_type VARCHAR(64),
        backed_up BOOLEAN DEFAULT FALSE,
        aaguid VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP
      )
    `);

    await executor(`CREATE INDEX IF NOT EXISTS idx_sys_passkey_user_id ON sys_passkey (user_id)`);

    // 登录日志添加登录方式列
    await executor(`ALTER TABLE sys_login_log ADD COLUMN IF NOT EXISTS login_method VARCHAR(16) DEFAULT 'password'`);

    // 回填现有数据
    await executor(`UPDATE sys_login_log SET login_method = 'password' WHERE login_method IS NULL`);
  },
  async down(executor) {
    await executor(`DROP TABLE IF EXISTS sys_passkey`);
    await executor(`ALTER TABLE sys_login_log DROP COLUMN IF EXISTS login_method`);
  },
};
