import type { Migration } from '@ventostack/database';

/**
 * 工具审计表下线：工具调用记录已由 ai-trace 的 tool span 全量覆盖
 * （name/args/result/status/duration + trace 上下文），ai_tool_log 不再写入也不再保留。
 */
export const dropAiToolLog: Migration = {
  name: '015_drop_ai_tool_log',
  up: async (executor) => {
    await executor(`DROP TABLE IF EXISTS ai_tool_log`);
  },
  down: async (executor) => {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_tool_log (
        id VARCHAR(36) PRIMARY KEY,
        conversation_id VARCHAR(36),
        message_id VARCHAR(36),
        tool_name VARCHAR(128) NOT NULL,
        input JSON,
        output JSON,
        status VARCHAR(16) NOT NULL,
        duration INT,
        user_id VARCHAR(36),
        tenant_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await executor(`CREATE INDEX IF NOT EXISTS idx_ai_tool_log_conv ON ai_tool_log (conversation_id)`);
  },
};
