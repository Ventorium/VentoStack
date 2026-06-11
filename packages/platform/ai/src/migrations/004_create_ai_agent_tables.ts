/**
 * 创建 AI Agent 相关表
 */
import type { Migration } from "@ventostack/database";

export const createAiAgentTables: Migration = {
  name: "004_create_ai_agent_tables",
  up: async (executor) => {
    // Agent 表
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_agent (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        avatar VARCHAR(512),
        type VARCHAR(32) NOT NULL DEFAULT 'chatbot',
        system_prompt TEXT NOT NULL,
        model VARCHAR(64) NOT NULL,
        tools JSON,
        knowledge_base_ids JSON,
        memory_config JSON,
        config JSON,
        max_iterations INT DEFAULT 10,
        max_tokens_per_turn INT DEFAULT 4096,
        tenant_id VARCHAR(36) NOT NULL,
        created_by VARCHAR(36) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'draft',
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 对话表
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_conversation (
        id VARCHAR(36) PRIMARY KEY,
        agent_id VARCHAR(36) NOT NULL REFERENCES ai_agent(id) ON DELETE CASCADE,
        user_id VARCHAR(36) NOT NULL,
        file_path VARCHAR(512) NOT NULL,
        title VARCHAR(255),
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        message_count INT DEFAULT 0,
        agent_config_snapshot JSON,
        tenant_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 消息表（元数据索引）
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_message (
        id VARCHAR(36) PRIMARY KEY,
        conversation_id VARCHAR(36) NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
        role VARCHAR(16) NOT NULL,
        content_preview TEXT,
        token_count INT DEFAULT 0,
        tenant_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 工具调用日志
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

    // 审批请求
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_approval_request (
        id VARCHAR(36) PRIMARY KEY,
        tool_name VARCHAR(128) NOT NULL,
        input JSON,
        requested_by VARCHAR(36) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'pending',
        approved_by VARCHAR(36),
        comment TEXT,
        expires_at TIMESTAMP NOT NULL,
        tenant_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 长期记忆
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_long_term_memory (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        file_path VARCHAR(512) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content_preview TEXT,
        tenant_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 索引
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_conv_user
      ON ai_conversation(user_id, agent_id, tenant_id)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_msg_conv
      ON ai_message(conversation_id, created_at)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_tool_log_conv
      ON ai_tool_log(conversation_id)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_tool_log_tool
      ON ai_tool_log(tool_name, tenant_id)
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_ltm_user
      ON ai_long_term_memory(user_id, tenant_id)
    `);
  },

  down: async (executor) => {
    await executor("DROP TABLE IF EXISTS ai_long_term_memory CASCADE");
    await executor("DROP TABLE IF EXISTS ai_approval_request CASCADE");
    await executor("DROP TABLE IF EXISTS ai_tool_log CASCADE");
    await executor("DROP TABLE IF EXISTS ai_message CASCADE");
    await executor("DROP TABLE IF EXISTS ai_conversation CASCADE");
    await executor("DROP TABLE IF EXISTS ai_agent CASCADE");
  },
};
