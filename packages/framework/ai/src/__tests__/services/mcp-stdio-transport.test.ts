import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMcpStdioClient, type McpServerItem } from "../../services/mcp-server";

describe("MCP stdio transport", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "mcp-stdio-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test("keeps one process alive and correlates concurrent JSON-RPC calls", async () => {
    const script = join(directory, "server.ts");
    await writeFile(script, `
let buffer = "";
for await (const chunk of Bun.stdin.stream()) {
  buffer += new TextDecoder().decode(chunk);
  const lines = buffer.split("\\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: {} } }));
    } else if (message.method === "tools/call") {
      const delay = message.params.arguments.delay ?? 0;
      setTimeout(() => {
        console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { structuredContent: { value: message.params.arguments.value } } }));
        if (message.params.arguments.value === "fast") console.log(JSON.stringify({ jsonrpc: "2.0", method: "notifications/tools/list_changed" }));
      }, delay);
    } else if (message.method === "tools/list") {
      console.log(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }] } }));
    }
  }
}
`, "utf-8");
    const server: McpServerItem = {
      id: "stdio",
      name: "stdio",
      description: null,
      transportType: "stdio",
      command: process.execPath,
      args: [script],
      env: null,
      url: null,
      headers: null,
      enabled: true,
      status: "connected",
      lastError: null,
      toolCount: 1,
      toolsSnapshot: [{ name: "echo", description: "Echo" }],
      tenantId: "tenant",
      createdAt: "",
      updatedAt: "",
    };
    const client = createMcpStdioClient(server);
    let changed = false;
    client.onToolsChanged(() => { changed = true; });

    const [slow, fast] = await Promise.all([
      client.callTool("echo", { value: "slow", delay: 10 }),
      client.callTool("echo", { value: "fast", delay: 0 }),
    ]);
    const tools = await client.listTools();
    await client.close();

    expect(slow).toEqual({ value: "slow" });
    expect(fast).toEqual({ value: "fast" });
    expect(changed).toBe(true);
    expect(tools[0]?.name).toBe("echo");
  });
});
