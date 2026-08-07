import { describe, expect, test } from "bun:test";
import { createMcpToolSource } from "../../agent-engine/mcp-tool-source";
import type { McpServerItem, McpServerService } from "../../services/mcp-server";

function server(): McpServerItem {
  return {
    id: "server-1",
    name: "filesystem",
    description: null,
    transportType: "sse",
    command: null,
    args: null,
    env: null,
    url: "https://mcp.example.test",
    headers: null,
    enabled: true,
    status: "connected",
    lastError: null,
    toolCount: 1,
    toolsSnapshot: [{
      name: "read_file",
      description: "Read a file",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    }],
    tenantId: "tenant-a",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("MCP tool source", () => {
  test("adapts discovered MCP tools to approval-required AgentTools", async () => {
    const calls: unknown[] = [];
    const service = {
      getById: async () => server(),
      refreshTools: async () => [],
      callTool: async (...args: unknown[]) => {
        calls.push(args);
        return [{ type: "text", text: "contents" }];
      },
    } as unknown as McpServerService;
    const source = createMcpToolSource(service);

    const tools = await source.loadTools(["server-1"], "tenant-a");
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("mcp_filesystem_read_file");
    expect(tools[0]?.requiresApproval).toBe(true);
    expect(tools[0]?.riskLevel).toBe("high");

    const result = await tools[0]!.execute("call-1", { path: "README.md" });
    expect(result.content).toEqual([{ type: "text", text: "contents" }]);
    expect(calls[0]).toEqual([
      "server-1",
      "tenant-a",
      "read_file",
      { path: "README.md" },
      undefined,
    ]);
  });

  test("does not expose disabled servers", async () => {
    const disabled = { ...server(), enabled: false };
    const service = {
      getById: async () => disabled,
    } as unknown as McpServerService;
    const tools = await createMcpToolSource(service).loadTools([disabled.id], "tenant-a");
    expect(tools).toEqual([]);
  });
});
