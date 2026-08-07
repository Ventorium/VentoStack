import { afterEach, describe, expect, test } from "bun:test";
import { callHttpMcpTool, createMcpHttpClient, parseMcpHttpBody, type McpServerItem } from "../../services/mcp-server";

function server(): McpServerItem {
  return {
    id: "server-1",
    name: "remote",
    description: null,
    transportType: "sse",
    command: null,
    args: null,
    env: null,
    url: "https://mcp.example.test/rpc",
    headers: { Authorization: "Bearer secret" },
    enabled: true,
    status: "connected",
    lastError: null,
    toolCount: 1,
    toolsSnapshot: [{ name: "lookup", description: "Lookup" }],
    tenantId: "tenant",
    createdAt: "",
    updatedAt: "",
  };
}

describe("MCP HTTP transport", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("initializes a session, calls the tool with its session id, and closes it", async () => {
    const requests: Array<{ method: string; headers: Headers; body: Record<string, unknown> | null }> = [];
    globalThis.fetch = (async (_input, init) => {
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      requests.push({ method: init?.method ?? "GET", headers, body });
      if (body?.method === "initialize") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "test", version: "1" } } }), {
          headers: { "content-type": "application/json", "mcp-session-id": "session-123" },
        });
      }
      if (body?.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (body?.method === "tools/call") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { answer: 42 } } }), { headers: { "content-type": "application/json" } });
      }
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const result = await callHttpMcpTool(server(), "lookup", { query: "vento" });

    expect(result).toEqual({ answer: 42 });
    expect(requests.map((request) => request.body?.method ?? request.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
      "DELETE",
    ]);
    expect(requests[2]?.headers.get("mcp-session-id")).toBe("session-123");
    expect(requests[2]?.headers.get("authorization")).toBe("Bearer secret");
  });

  test("selects the matching JSON-RPC response from an event stream", () => {
    const notifications: string[] = [];
    const body = [
      "event: message",
      'data: {"jsonrpc":"2.0","method":"notifications/progress"}',
      "",
      "event: message",
      'data: {"jsonrpc":"2.0","id":"wanted","result":{"content":[]}}',
      "",
    ].join("\n");

    expect(parseMcpHttpBody(body, "text/event-stream", "wanted", (notification) => {
      notifications.push(String(notification.method));
    }).id).toBe("wanted");
    expect(notifications).toEqual(["notifications/progress"]);
  });

  test("reuses one initialized session for multiple tool calls", async () => {
    const methods: string[] = [];
    globalThis.fetch = (async (_input, init) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      methods.push(typeof body?.method === "string" ? body.method : init?.method ?? "GET");
      if (body?.method === "initialize") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", capabilities: {} } }), {
          headers: { "content-type": "application/json", "mcp-session-id": "reused" },
        });
      }
      if (body?.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (body?.method === "tools/call") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { ok: true } } }), { headers: { "content-type": "application/json" } });
      }
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    const client = createMcpHttpClient(server());

    await client.callTool("lookup", { query: "first" });
    await client.callTool("lookup", { query: "second" });
    await client.close();

    expect(methods.filter((method) => method === "initialize")).toHaveLength(1);
    expect(methods.filter((method) => method === "tools/call")).toHaveLength(2);
    expect(methods.at(-1)).toBe("DELETE");
  });
});
