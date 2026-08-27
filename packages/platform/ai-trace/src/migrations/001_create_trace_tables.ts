import type { Migration } from "@ventostack/database";

export const createTraceTables: Migration = {
  name: "001_create_ai_trace_tables",

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_trace (
        id VARCHAR(36) PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL,
        agent_id VARCHAR(64),
        session_id VARCHAR(64),
        user_id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'running',
        user_message TEXT,
        assistant_preview TEXT,
        system_prompt TEXT,
        model VARCHAR(128),
        meta JSONB,
        usage JSONB,
        error TEXT,
        turn_count INT DEFAULT 0,
        tool_count INT DEFAULT 0,
        duration_ms INT,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_trace_span (
        id VARCHAR(36) PRIMARY KEY,
        trace_id VARCHAR(36) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        seq INT NOT NULL DEFAULT 0,
        turn_index INT NOT NULL DEFAULT 0,
        span_type VARCHAR(16) NOT NULL,
        name VARCHAR(128) NOT NULL,
        category VARCHAR(24),
        status VARCHAR(16) NOT NULL DEFAULT 'running',
        input JSONB,
        output JSONB,
        error TEXT,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        duration_ms INT
      )
    `);

    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_trace_conv ON ai_trace (tenant_id, conversation_id, started_at DESC)",
    );
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_trace_time ON ai_trace (tenant_id, started_at DESC)",
    );
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_trace_span_trace ON ai_trace_span (trace_id, seq)",
    );
  },

  async down(executor) {
    await executor("DROP TABLE IF EXISTS ai_trace_span");
    await executor("DROP TABLE IF EXISTS ai_trace");
  },
};
