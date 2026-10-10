import type { Migration } from "@ventostack/database";

/**
 * 上下文洞察表结构（替代 ai_trace / ai_trace_span）
 *
 * 五张表：
 *   ai_context_session  会话画像（跨 run 聚合，含当前构成与累计用量）
 *   ai_context_request  每一次模型请求的上下文快照（趋势图 + 步骤简报）
 *   ai_context_event    上下文变更事件（注入/压缩/裁剪/切换）
 *   ai_context_node     上下文组成元素（Context Browser；压缩不删行，只打 gone_at_seq）
 *   ai_context_file_op  文件操作日志（File Activity）
 *
 * 所有表以 (tenant_id, session_id) 为主要查询维度建索引；
 * tenant_id 一律非空，配合服务层无条件过滤满足 CLAUDE.md §16 租户硬约束。
 */
export const createContextTables: Migration = {
  name: "001_create_ai_context_tables",

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_context_session (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        title TEXT,
        agent_id VARCHAR(64),
        agent_name VARCHAR(128),
        user_id VARCHAR(64),
        user_name VARCHAR(128),
        parent_run_id VARCHAR(36),
        run_count INT DEFAULT 0,
        model VARCHAR(128),
        provider VARCHAR(64),
        context_window INT,
        status VARCHAR(16) NOT NULL DEFAULT 'running',
        turn_count INT DEFAULT 0,
        step_count INT DEFAULT 0,
        inject_count INT DEFAULT 0,
        compact_count INT DEFAULT 0,
        prune_count INT DEFAULT 0,
        skill_count INT DEFAULT 0,
        human_input_count INT DEFAULT 0,
        answer_count INT DEFAULT 0,
        current_system INT DEFAULT 0,
        current_tools INT DEFAULT 0,
        current_user_msgs INT DEFAULT 0,
        current_inject INT DEFAULT 0,
        current_skill INT DEFAULT 0,
        current_assistant INT DEFAULT 0,
        current_tool INT DEFAULT 0,
        current_total INT DEFAULT 0,
        usage_uncached BIGINT DEFAULT 0,
        usage_cache_read BIGINT DEFAULT 0,
        usage_cache_write BIGINT DEFAULT 0,
        usage_output BIGINT DEFAULT 0,
        duration_ms BIGINT DEFAULT 0,
        last_user TEXT,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        rev INT NOT NULL DEFAULT 0
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_context_request (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        seq INT NOT NULL,
        turn_index INT NOT NULL DEFAULT 0,
        model VARCHAR(128),
        provider VARCHAR(64),
        message_count INT,
        context_window INT,
        comp_system INT DEFAULT 0,
        comp_tools INT DEFAULT 0,
        comp_user INT DEFAULT 0,
        comp_inject INT DEFAULT 0,
        comp_skill INT DEFAULT 0,
        comp_assistant INT DEFAULT 0,
        comp_tool INT DEFAULT 0,
        comp_total INT DEFAULT 0,
        act_uncached BIGINT,
        act_output BIGINT,
        act_cache_read BIGINT,
        act_cache_write BIGINT,
        duration_ms INT,
        brief JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_context_event (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        seq INT NOT NULL,
        kind VARCHAR(16) NOT NULL,
        producer VARCHAR(128) NOT NULL DEFAULT '',
        delta_tokens INT NOT NULL DEFAULT 0,
        turn_index INT NOT NULL DEFAULT 0,
        detail JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_context_node (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        seq INT NOT NULL,
        category VARCHAR(16) NOT NULL,
        name VARCHAR(256) NOT NULL DEFAULT '',
        tokens INT NOT NULL DEFAULT 0,
        preview TEXT,
        content TEXT,
        images INT NOT NULL DEFAULT 0,
        gone_at_seq INT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_context_file_op (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        seq INT NOT NULL,
        path VARCHAR(512) NOT NULL,
        kind VARCHAR(16) NOT NULL,
        tool VARCHAR(64) NOT NULL,
        err BOOLEAN NOT NULL DEFAULT FALSE,
        added INT NOT NULL DEFAULT 0,
        removed INT NOT NULL DEFAULT 0,
        detail TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 会话列表：按租户 + 最近活跃排序
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_ctx_session_time ON ai_context_session (tenant_id, started_at DESC)",
    );
    // 单会话详情：请求 / 事件 / 节点 / 文件操作均按 (tenant, session, seq) 顺序取
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_ctx_request_seq ON ai_context_request (tenant_id, session_id, seq)",
    );
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_ctx_event_seq ON ai_context_event (tenant_id, session_id, seq)",
    );
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_ctx_node_seq ON ai_context_node (tenant_id, session_id, seq)",
    );
    // 活跃面重建：只取未归档节点（gone_at_seq IS NULL）
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_ctx_node_live ON ai_context_node (tenant_id, session_id, gone_at_seq, seq)",
    );
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_ctx_fileop_seq ON ai_context_file_op (tenant_id, session_id, seq)",
    );
    // 概览按天聚合
    await executor(
      "CREATE INDEX IF NOT EXISTS idx_ai_ctx_request_time ON ai_context_request (tenant_id, created_at)",
    );
  },

  async down(executor) {
    await executor("DROP TABLE IF EXISTS ai_context_file_op");
    await executor("DROP TABLE IF EXISTS ai_context_node");
    await executor("DROP TABLE IF EXISTS ai_context_event");
    await executor("DROP TABLE IF EXISTS ai_context_request");
    await executor("DROP TABLE IF EXISTS ai_context_session");
  },
};