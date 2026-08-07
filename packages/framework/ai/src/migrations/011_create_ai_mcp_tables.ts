/**
 * MCP Server 管理表
 */
import type { Migration } from "@ventostack/database";

export const createAiMcpTables: Migration = {
  name: "011_create_ai_mcp_tables",
  up: async (executor) => {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_mcp_server (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        transport_type VARCHAR(16) NOT NULL DEFAULT 'stdio',
        command VARCHAR(512),
        args JSON,
        env JSON,
        url VARCHAR(1024),
        headers JSON,
        enabled BOOLEAN DEFAULT TRUE,
        status VARCHAR(16) DEFAULT 'pending',
        last_error TEXT,
        tool_count INT DEFAULT 0,
        tools_snapshot JSON,
        tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_mcp_server_tenant
      ON ai_mcp_server(tenant_id)
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_agent_mcp (
        id VARCHAR(36) PRIMARY KEY,
        agent_id VARCHAR(36) NOT NULL REFERENCES ai_agent(id) ON DELETE CASCADE,
        mcp_server_id VARCHAR(36) NOT NULL REFERENCES ai_mcp_server(id) ON DELETE CASCADE,
        enabled BOOLEAN DEFAULT TRUE,
        tenant_id VARCHAR(36) NOT NULL DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_mcp_unique
      ON ai_agent_mcp(agent_id, mcp_server_id)
    `);
  },

  down: async (executor) => {
    await executor(`DROP TABLE IF EXISTS ai_agent_mcp CASCADE`);
    await executor(`DROP TABLE IF EXISTS ai_mcp_server CASCADE`);
  },
};
