import { describe, expect, test } from "bun:test";
import { createMcpServerService, type McpClient, type McpServerItem } from "../../services/mcp-server";
import type { Database } from "@ventostack/database";

function row(): Record<string, unknown> {
  return {
    id: "server-1",
    name: "dynamic",
    transport_type: "sse",
    url: "https://mcp.example.test/rpc",
    enabled: true,
    status: "connected",
    tool_count: 1,
    tools_snapshot: [{ name: "lookup", description: "old" }],
    tenant_id: "tenant-a",
  };
}

describe("MCP dynamic tool catalog", () => {
  test("persists a refreshed snapshot after tools/list_changed", async () => {
    const updates: unknown[][] = [];
    const db = {
      async raw(sql: string, params: unknown[] = []) {
        if (sql.includes("SELECT * FROM ai_mcp_server")) return [row()];
        if (sql.includes("UPDATE ai_mcp_server SET tools_snapshot")) updates.push(params);
        return [];
      },
    } as unknown as Database;
    let notify: (() => void) | undefined;
    const client: McpClient = {
      async callTool() {
        notify?.();
        return { ok: true };
      },
      async listTools() {
        return [{ name: "lookup", description: "new" }, { name: "write", description: "added" }];
      },
      onToolsChanged(handler) {
        notify = handler;
        return () => { notify = undefined; };
      },
      async close() {},
    };
    const service = createMcpServerService({
      db,
      allowedHttpHosts: ["mcp.example.test"],
      clientFactory: () => client,
    });

    await service.callTool("server-1", "tenant-a", "lookup", {});
    for (let index = 0; index < 10 && updates.length === 0; index++) await Promise.resolve();

    expect(updates).toHaveLength(1);
    expect(updates[0]?.[1]).toBe(2);
    expect(JSON.parse(String(updates[0]?.[0]))).toEqual([
      { name: "lookup", description: "new" },
      { name: "write", description: "added" },
    ]);
    await service.close();
  });
});
