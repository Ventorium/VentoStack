import type { Migration } from '@ventostack/database';

/**
 * 渠道表结构
 *
 * 五张表：
 *   ai_channel           渠道实例（类型 + 凭证 + 策略 + 运行态）
 *   ai_channel_identity  外部账号绑定（谁可以在渠道里使用这个渠道）
 *   ai_channel_bind_code 一次性绑定码（Web 端生成，渠道内 /绑定 消费）
 *   ai_channel_session   外部会话 ↔ AI 会话绑定（反向闭环的枢纽）
 *   ai_channel_message   入站幂等 + 出站队列 + 审计
 *
 * 渠道为**个人级资源**：所有查询强制 tenant_id + user_id 双条件，
 * 不做租户共享（跨用户一律 404，避免探测）。
 */
export const createAiChannelTables: Migration = {
  name: '001_create_ai_channel_tables',

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_channel (
        id              VARCHAR(36) PRIMARY KEY,
        tenant_id       VARCHAR(64) NOT NULL,
        user_id         VARCHAR(64) NOT NULL,
        type            VARCHAR(32) NOT NULL,
        name            VARCHAR(64) NOT NULL,
        config          JSONB NOT NULL DEFAULT '{}'::jsonb,
        secrets         TEXT,
        runtime_state   JSONB NOT NULL DEFAULT '{}'::jsonb,
        agent_id        VARCHAR(64),
        enabled         BOOLEAN NOT NULL DEFAULT FALSE,
        status          VARCHAR(16) NOT NULL DEFAULT 'inactive',
        status_detail   TEXT,
        last_active_at  TIMESTAMP,
        created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_channel_owner
        ON ai_channel(tenant_id, user_id, type, name)
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_channel_enabled
        ON ai_channel(enabled, type)
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_channel_user
        ON ai_channel(tenant_id, user_id)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_channel_identity (
        id                VARCHAR(36) PRIMARY KEY,
        channel_id        VARCHAR(36) NOT NULL REFERENCES ai_channel(id) ON DELETE CASCADE,
        tenant_id         VARCHAR(64) NOT NULL,
        user_id           VARCHAR(64) NOT NULL,
        external_user_id  VARCHAR(191) NOT NULL,
        external_chat_id  VARCHAR(191),
        display_name      VARCHAR(128),
        verified_at       TIMESTAMP,
        created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_channel_identity_ext
        ON ai_channel_identity(channel_id, external_user_id)
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_channel_identity_user
        ON ai_channel_identity(tenant_id, user_id)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_channel_bind_code (
        code         VARCHAR(12) PRIMARY KEY,
        channel_id   VARCHAR(36) NOT NULL,
        tenant_id    VARCHAR(64) NOT NULL,
        user_id      VARCHAR(64) NOT NULL,
        expires_at   TIMESTAMP NOT NULL,
        consumed_at  TIMESTAMP,
        created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_channel_bind_expire
        ON ai_channel_bind_code(expires_at)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_channel_session (
        id               VARCHAR(36) PRIMARY KEY,
        channel_id       VARCHAR(36) NOT NULL REFERENCES ai_channel(id) ON DELETE CASCADE,
        tenant_id        VARCHAR(64) NOT NULL,
        user_id          VARCHAR(64) NOT NULL,
        external_key     VARCHAR(255) NOT NULL,
        session_id       VARCHAR(64) NOT NULL,
        agent_id         VARCHAR(64),
        origin           VARCHAR(16) NOT NULL DEFAULT 'inbound',
        reply_context    JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_message_at  TIMESTAMP,
        created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_channel_session_key
        ON ai_channel_session(channel_id, external_key)
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_channel_session_sid
        ON ai_channel_session(tenant_id, session_id)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_channel_message (
        id                   VARCHAR(36) PRIMARY KEY,
        channel_id           VARCHAR(36) NOT NULL,
        tenant_id            VARCHAR(64) NOT NULL,
        direction            VARCHAR(8) NOT NULL,
        kind                 VARCHAR(16) NOT NULL,
        external_message_id  VARCHAR(191),
        external_key         VARCHAR(255),
        session_id           VARCHAR(64),
        status               VARCHAR(16) NOT NULL,
        payload              TEXT,
        payload_preview      TEXT,
        error                TEXT,
        attempts             INT NOT NULL DEFAULT 0,
        next_retry_at        TIMESTAMP,
        created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // 幂等：同一渠道同一方向同一平台消息 id 只处理一次
    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_channel_msg_dedup
        ON ai_channel_message(channel_id, direction, external_message_id)
        WHERE external_message_id IS NOT NULL
    `);
    // 出站队列扫描
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_channel_outbox
        ON ai_channel_message(status, next_retry_at) WHERE direction = 'out'
    `);
    // 渠道消息记录页（按渠道 + 时间倒序）
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_channel_msg_recent
        ON ai_channel_message(channel_id, created_at DESC)
    `);
  },

  async down(executor) {
    await executor('DROP TABLE IF EXISTS ai_channel_message');
    await executor('DROP TABLE IF EXISTS ai_channel_session');
    await executor('DROP TABLE IF EXISTS ai_channel_bind_code');
    await executor('DROP TABLE IF EXISTS ai_channel_identity');
    await executor('DROP TABLE IF EXISTS ai_channel');
  },
};
