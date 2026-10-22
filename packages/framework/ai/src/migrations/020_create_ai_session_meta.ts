import type { Migration } from '@ventostack/database';

/**
 * 会话元数据投影表（ai_session_meta）
 *
 * 背景：会话正文的权威存储仍是磁盘 JSONL（会话是一棵树，含 fork / compaction /
 * branch_summary 等结构，关系表无法表达）。但「会话归属 / 来源 / 会话级设置」需要
 * 跨会话查询、索引与事务，JSONL 做不到：
 *
 *   - 按用户列出会话需要索引，遍历 memories/*\/users/*\/conversations 不可接受；
 *   - 自动推送需要定时扫「开启渠道通知的会话」，必须是一次索引查找；
 *   - 渠道侧要「发消息 + 写反向绑定 + 记通知台账」同事务，JSONL 无法参与。
 *
 * 因此本表只做投影，不存正文：jsonl 为准，meta 可重建（SessionService.backfill）。
 * 反面教材是 ai_conversation 表——历史上试图把会话塞进关系表，正文早已迁走，
 * 只剩 id/title/status 几个壳字段。
 */
export const createAiSessionMeta: Migration = {
  name: '020_create_ai_session_meta',

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_session_meta (
        session_id           VARCHAR(64) PRIMARY KEY,
        tenant_id            VARCHAR(64) NOT NULL,
        user_id              VARCHAR(64) NOT NULL,
        agent_id             VARCHAR(64) NOT NULL,
        origin               VARCHAR(16) NOT NULL DEFAULT 'web',
        origin_channel_id    VARCHAR(36),
        origin_channel_type  VARCHAR(32),
        settings             JSONB NOT NULL DEFAULT '{}'::jsonb,
        deleted_at           TIMESTAMP,
        created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 会话列表：按 (租户, 用户) + 创建时间倒序
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_session_meta_user
        ON ai_session_meta(tenant_id, user_id, created_at DESC)
    `);

    // 渠道维度反查：某渠道产生过哪些会话（渠道删除时做清理 / 统计）
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_session_meta_channel
        ON ai_session_meta(tenant_id, origin_channel_id)
    `);

    // 自动推送扫描：只索引「开启渠道通知」的会话，避免全表扫
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_session_meta_notify
        ON ai_session_meta(tenant_id)
        WHERE (settings -> 'channel' ->> 'notifyEnabled') = 'true'
    `);
  },

  async down(executor) {
    await executor('DROP TABLE IF EXISTS ai_session_meta');
  },
};
