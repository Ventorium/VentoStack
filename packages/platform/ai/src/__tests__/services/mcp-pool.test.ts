import { describe, expect, test } from "bun:test";
import { createMcpServerService, type McpClient } from "../../services/mcp-server";
import type { Database } from "@ventostack/database";

function serverRow(id: string): Record<string, unknown> {
  return {
    id,
    name: `server-${id}`,
    transport_type: "sse",
    url: "https://mcp.example.test/rpc",
    enabled: true,
    status: "connected",
    tool_count: 1,
    tools_snapshot: [{ name: "lookup", description: "old" }],
    tenant_id: "tenant-a",
  };
}

function createMockDb(): Database {
  return {
    async raw(sql: string, params: unknown[] = []) {
      if (sql.includes("SELECT * FROM ai_mcp_server")) return [serverRow(String(params[0] ?? "server-1"))];
      return [];
    },
  } as unknown as Database;
}

function makeClient(closeSpy: () => void, listTools?: () => Promise<{ name: string; description: string }[]>): McpClient {
  return {
    async callTool() {
      return { ok: true };
    },
    async listTools() {
      return listTools?.() ?? [{ name: "lookup", description: "x" }];
    },
    onToolsChanged() {
      return () => {};
    },
    async close() {
      closeSpy();
    },
  };
}

describe("MCP 连接池硬化", () => {
  test("maxClients 超限时淘汰最久未用的客户端（LRU）", async () => {
    const closed: string[] = [];
    const db = {
      async raw(sql: string, params: unknown[] = []) {
        if (sql.includes("SELECT * FROM ai_mcp_server")) return [serverRow(String(params[0]))];
        return [];
      },
    } as unknown as Database;
    const service = createMcpServerService({
      db,
      allowedHttpHosts: ["mcp.example.test"],
      pool: { maxClients: 2, idleTimeoutMs: 60_000 },
      clientFactory: (server) => makeClient(() => closed.push(server.id)),
    });

    // 三个不同 server 依次接触 → 第 1 个应被 LRU 淘汰
    await service.refreshTools("server-1", "tenant-a");
    await service.refreshTools("server-2", "tenant-a");
    await service.refreshTools("server-3", "tenant-a");
    // 等 evictToLimit 异步淘汰落定
    for (let index = 0; index < 10 && closed.length === 0; index++) await Promise.resolve();

    expect(closed).toEqual(["server-1"]);
    // 池内保留 server-2 / server-3
    expect(closed).toHaveLength(1);
    await service.close();
  });

  test("空闲超时后回收未使用的客户端", async () => {
    const closed: string[] = [];
    const service = createMcpServerService({
      db: createMockDb(),
      allowedHttpHosts: ["mcp.example.test"],
      pool: { maxClients: 8, idleTimeoutMs: 50 },
      clientFactory: (server) => makeClient(() => closed.push(server.id)),
    });

    await service.refreshTools("server-1", "tenant-a");
    expect(closed).toHaveLength(0);

    // 等待 idleTimeoutMs 的清理周期（清理间隔取 min(idleTimeoutMs, 60s) = 50ms）
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(closed).toContain("server-1");
    await service.close();
  });
});
