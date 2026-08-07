import { column, defineModel } from "@ventostack/database";

/**
 * MCP Server 配置表
 * 支持 stdio（本地进程）和 sse（远程 HTTP）两种传输方式
 */
export const AiMcpServerModel = defineModel(
  "ai_mcp_server",
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 128 }),
    description: column.text({ nullable: true }),
    transport_type: column.varchar({ length: 16, default: "stdio" }), // stdio | sse
    // stdio 字段
    command: column.varchar({ length: 512, nullable: true }),
    args: column.json({ nullable: true }),        // string[]
    env: column.json({ nullable: true }),          // Record<string, string>
    // sse 字段
    url: column.varchar({ length: 1024, nullable: true }),
    headers: column.json({ nullable: true }),      // Record<string, string>
    // 通用
    enabled: column.boolean({ default: true }),
    status: column.varchar({ length: 16, default: "pending" }), // pending | connected | error
    last_error: column.text({ nullable: true }),
    tool_count: column.int({ default: 0 }),
    tools_snapshot: column.json({ nullable: true }), // 缓存的工具列表
    tenant_id: column.varchar({ length: 36, default: "default" }),
  },
  { timestamps: true },
);

/** Agent-MCP 关联表（多对多） */
export const AiAgentMcpModel = defineModel(
  "ai_agent_mcp",
  {
    id: column.varchar({ primary: true, length: 36 }),
    agent_id: column.varchar({ length: 36 }),
    mcp_server_id: column.varchar({ length: 36 }),
    enabled: column.boolean({ default: true }),
    tenant_id: column.varchar({ length: 36, default: "default" }),
    created_at: column.timestamp({ default: "NOW" }),
  },
  { timestamps: false },
);
