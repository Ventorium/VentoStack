/**
 * MCP Server 管理服务
 * CRUD + 连接测试 + 工具发现
 *
 * MCP (Model Context Protocol) 是 Anthropic 提出的开放标准，
 * 用于连接 AI 模型与外部工具/数据源。
 * 支持两种传输方式：
 * - stdio: 通过子进程 stdin/stdout 通信（本地工具）
 * - sse: 通过 HTTP SSE 通信（远程工具服务）
 */
import type { Database } from "@ventostack/database";
import { aiErrors } from "../errors";

export interface McpServerItem {
  id: string;
  name: string;
  description: string | null;
  transportType: "stdio" | "sse";
  command: string | null;
  args: string[] | null;
  env: Record<string, string> | null;
  url: string | null;
  headers: Record<string, string> | null;
  enabled: boolean;
  status: "pending" | "connected" | "error";
  lastError: string | null;
  toolCount: number;
  toolsSnapshot: McpToolInfo[] | null;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown> | undefined;
}

export interface CreateMcpServerParams {
  name: string;
  description?: string;
  transportType: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  tenantId: string;
}

export interface UpdateMcpServerParams {
  name?: string;
  description?: string;
  transportType?: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

export interface McpServerService {
  create(params: CreateMcpServerParams): Promise<McpServerItem>;
  getById(id: string, tenantId: string): Promise<McpServerItem | null>;
  list(tenantId: string, params?: { enabled?: boolean; page?: number; pageSize?: number }): Promise<{ list: McpServerItem[]; total: number }>;
  update(id: string, params: UpdateMcpServerParams, tenantId: string): Promise<McpServerItem>;
  delete(id: string, tenantId: string): Promise<void>;
  setEnabled(id: string, tenantId: string, enabled: boolean): Promise<void>;
  testConnection(id: string, tenantId: string): Promise<{ success: boolean; tools?: McpToolInfo[]; error?: string }>;
  refreshTools(id: string, tenantId: string): Promise<McpToolInfo[]>;
}

export interface McpServerServiceDeps {
  db: Database;
  allowedStdioCommands?: string[];
}

const DEFAULT_STDIO_COMMANDS: string[] = [];

function mapRow(r: Record<string, unknown>): McpServerItem {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    transportType: (r.transport_type as "stdio" | "sse") ?? "stdio",
    command: (r.command as string) ?? null,
    args: typeof r.args === "string" ? JSON.parse(r.args) : (r.args as string[]) ?? null,
    env: typeof r.env === "string" ? JSON.parse(r.env) : (r.env as Record<string, string>) ?? null,
    url: (r.url as string) ?? null,
    headers: typeof r.headers === "string" ? JSON.parse(r.headers) : (r.headers as Record<string, string>) ?? null,
    enabled: (r.enabled as boolean) ?? true,
    status: (r.status as "pending" | "connected" | "error") ?? "pending",
    lastError: (r.last_error as string) ?? null,
    toolCount: Number(r.tool_count ?? 0),
    toolsSnapshot: (r.tools_snapshot as McpToolInfo[]) ?? null,
    tenantId: r.tenant_id as string,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ""),
  };
}

export function createMcpServerService(deps: McpServerServiceDeps): McpServerService {
  const { db } = deps;
  const allowedStdioCommands = new Set(deps.allowedStdioCommands ?? DEFAULT_STDIO_COMMANDS);

  async function create(params: CreateMcpServerParams): Promise<McpServerItem> {
    validateMcpConfig(params, allowedStdioCommands);
    const id = crypto.randomUUID();
    await db.raw(
      `INSERT INTO ai_mcp_server (id, name, description, transport_type, command, args, env, url, headers, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, params.name, params.description ?? null, params.transportType,
        params.command ?? null,
        params.args ? JSON.stringify(params.args) : null,
        params.env ? JSON.stringify(params.env) : null,
        params.url ?? null,
        params.headers ? JSON.stringify(params.headers) : null,
        params.tenantId,
      ],
    );
    return (await getById(id, params.tenantId))!;
  }

  async function getById(id: string, tenantId: string): Promise<McpServerItem | null> {
    const rows = await db.raw(
      `SELECT * FROM ai_mcp_server WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    ) as Array<Record<string, unknown>>;
    return rows.length > 0 ? mapRow(rows[0]!) : null;
  }

  async function list(tenantId: string, params?: { enabled?: boolean; page?: number; pageSize?: number }): Promise<{ list: McpServerItem[]; total: number }> {
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 50;
    const offset = (page - 1) * pageSize;
    const conditions: string[] = ["tenant_id = $1"];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (params?.enabled !== undefined) {
      conditions.push(`enabled = $${idx++}`);
      values.push(params.enabled);
    }

    const where = conditions.join(" AND ");
    const countRows = await db.raw(`SELECT COUNT(*) as cnt FROM ai_mcp_server WHERE ${where}`, values) as Array<Record<string, unknown>>;
    const total = Number(countRows[0]?.cnt ?? 0);
    const rows = await db.raw(
      `SELECT * FROM ai_mcp_server WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, pageSize, offset],
    ) as Array<Record<string, unknown>>;
    return { list: rows.map(mapRow), total };
  }

  async function update(id: string, params: UpdateMcpServerParams, tenantId: string): Promise<McpServerItem> {
    const current = await getById(id, tenantId);
    if (!current) throw aiErrors.toolNotFound("mcp-server");
    validateMcpConfig(
      {
        ...current,
        ...params,
        transportType: params.transportType ?? current.transportType,
        command: params.command ?? current.command ?? undefined,
        args: params.args ?? current.args ?? undefined,
        env: params.env ?? current.env ?? undefined,
        url: params.url ?? current.url ?? undefined,
        headers: params.headers ?? current.headers ?? undefined,
        tenantId,
      },
      allowedStdioCommands,
    );
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.name !== undefined) { sets.push(`name = $${idx++}`); values.push(params.name); }
    if (params.description !== undefined) { sets.push(`description = $${idx++}`); values.push(params.description); }
    if (params.transportType !== undefined) { sets.push(`transport_type = $${idx++}`); values.push(params.transportType); }
    if (params.command !== undefined) { sets.push(`command = $${idx++}`); values.push(params.command); }
    if (params.args !== undefined) { sets.push(`args = $${idx++}`); values.push(JSON.stringify(params.args)); }
    if (params.env !== undefined) { sets.push(`env = $${idx++}`); values.push(JSON.stringify(params.env)); }
    if (params.url !== undefined) { sets.push(`url = $${idx++}`); values.push(params.url); }
    if (params.headers !== undefined) { sets.push(`headers = $${idx++}`); values.push(JSON.stringify(params.headers)); }
    if (params.enabled !== undefined) { sets.push(`enabled = $${idx++}`); values.push(params.enabled); }

    if (sets.length === 0) return (await getById(id, tenantId))!;

    sets.push(`updated_at = NOW()`);
    values.push(id, tenantId);
    await db.raw(
      `UPDATE ai_mcp_server SET ${sets.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx}`,
      values,
    );
    return (await getById(id, tenantId))!;
  }

  async function deleteById(id: string, tenantId: string): Promise<void> {
    await db.raw(`DELETE FROM ai_mcp_server WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  }

  async function setEnabled(id: string, tenantId: string, enabled: boolean): Promise<void> {
    await db.raw(
      `UPDATE ai_mcp_server SET enabled = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
      [enabled, id, tenantId],
    );
  }

  async function testConnection(id: string, tenantId: string): Promise<{ success: boolean; tools?: McpToolInfo[]; error?: string }> {
    const server = await getById(id, tenantId);
    if (!server) return { success: false, error: "MCP Server 不存在" };

    try {
      if (server.transportType === "stdio") {
        return await testStdioConnection(server);
      } else {
        return await testSseConnection(server);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "连接测试失败";
      await db.raw(
        `UPDATE ai_mcp_server SET status = 'error', last_error = $1, updated_at = NOW() WHERE id = $2`,
        [error, id],
      );
      return { success: false, error };
    }
  }

  async function testStdioConnection(server: McpServerItem): Promise<{ success: boolean; tools?: McpToolInfo[]; error?: string }> {
    if (!server.command) return { success: false, error: "stdio 模式需要配置 command" };
    const commandError = validateStdioCommand(server.command, allowedStdioCommands);
    if (commandError) return { success: false, error: commandError };

    try {
      // 尝试启动进程并发送 initialize 请求
      const args = server.args ?? [];
      const envVars: Record<string, string> = {};
      if (server.env) Object.assign(envVars, server.env);
      const env = { ...process.env, ...envVars };
      const proc = Bun.spawn([server.command, ...args], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env,
      });

      // 发送 MCP initialize 请求
      const initRequest = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "VentoStack", version: "1.0.0" },
        },
      }) + "\n";

      await proc.stdin.write(new TextEncoder().encode(initRequest));

      // 读取响应（带超时）
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let response = "";

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("连接超时 (10s)")), 10_000)
      );

      const readPromise = (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          response += decoder.decode(value, { stream: true });
          if (response.includes("\n")) break; // 收到完整行
        }
      })();

      await Promise.race([readPromise, timeoutPromise]);

      // 关闭进程
      proc.kill();
      await proc.exited.catch(() => {});

      if (!response.trim()) {
        return { success: false, error: "进程无响应" };
      }

      // 解析响应
      const parsed = JSON.parse(response.trim());
      if (parsed.error) {
        return { success: false, error: parsed.error.message ?? "初始化失败" };
      }

      // 尝试获取工具列表
      const tools = await discoverToolsStdio(server);

      // 更新状态
      await db.raw(
        `UPDATE ai_mcp_server SET status = 'connected', last_error = NULL, tool_count = $1, tools_snapshot = $2, updated_at = NOW() WHERE id = $3`,
        [tools.length, JSON.stringify(tools), server.id],
      );

      return { success: true, tools };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "stdio 连接失败" };
    }
  }

  /**
   * MCP SSE 传输协议测试
   *
   * 支持两种模式:
   * 1. 标准 MCP SSE: GET /sse 建立 SSE 流 → 收到 endpoint 事件 → POST 消息到 endpoint
   * 2. 简化 HTTP 模式: 直接 POST JSON-RPC 到 URL（部分代理/网关服务器支持）
   */
  async function testSseConnection(server: McpServerItem): Promise<{ success: boolean; tools?: McpToolInfo[]; error?: string }> {
    if (!server.url) return { success: false, error: "SSE 模式需要配置 url" };

    const baseHeaders: Record<string, string> = {
      "User-Agent": "VentoStack-MCP/1.0",
      ...(server.headers ?? {}),
    };

    try {
      // 先尝试标准 MCP SSE 协议：GET 建立 SSE 流
      const tools = await tryStandardSse(server.url, baseHeaders);

      await db.raw(
        `UPDATE ai_mcp_server SET status = 'connected', last_error = NULL, tool_count = $1, tools_snapshot = $2, updated_at = NOW() WHERE id = $3`,
        [tools.length, JSON.stringify(tools), server.id],
      );
      return { success: true, tools };
    } catch (sseErr) {
      // 标准 SSE 失败，回退到简化 HTTP 模式
      try {
        const tools = await trySimpleHttp(server.url, baseHeaders);
        await db.raw(
          `UPDATE ai_mcp_server SET status = 'connected', last_error = NULL, tool_count = $1, tools_snapshot = $2, updated_at = NOW() WHERE id = $3`,
          [tools.length, JSON.stringify(tools), server.id],
        );
        return { success: true, tools };
      } catch (httpErr) {
        const error = `SSE: ${(sseErr as Error).message}; HTTP: ${(httpErr as Error).message}`;
        await db.raw(`UPDATE ai_mcp_server SET status = 'error', last_error = $1, updated_at = NOW() WHERE id = $2`, [error, server.id]);
        return { success: false, error };
      }
    }
  }

  /** 标准 MCP SSE 协议 */
  async function tryStandardSse(url: string, baseHeaders: Record<string, string>): Promise<McpToolInfo[]> {
    return new Promise<McpToolInfo[]>((resolve, reject) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => { controller.abort(); reject(new Error("SSE 连接超时 (10s)")); }, 10_000);

      let messageEndpoint: string | null = null;
      let resolved = false;

      // GET 建立 SSE 流
      fetch(url, {
        headers: { ...baseHeaders, "Accept": "text/event-stream" },
        signal: controller.signal,
      }).then(resp => {
        if (!resp.ok) { clearTimeout(timeout); reject(new Error(`SSE HTTP ${resp.status}`)); return; }

        const reader = resp.body?.getReader();
        if (!reader) { clearTimeout(timeout); reject(new Error("SSE 无响应流")); return; }

        const decoder = new TextDecoder();
        let buffer = "";

        function processEvents() {
          reader!.read().then(({ done, value }) => {
            if (done) {
              clearTimeout(timeout);
              if (!resolved) reject(new Error("SSE 流已关闭"));
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            let eventType = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (eventType === "endpoint") {
                  // 收到 endpoint 事件，data 是 POST 消息的相对路径
                  messageEndpoint = data.startsWith("http") ? data : new URL(data, url).href;
                  // 发送 initialize + tools/list
                  sendMcpMessages(messageEndpoint!, baseHeaders, controller.signal)
                    .then(tools => { resolved = true; clearTimeout(timeout); resolve(tools); })
                    .catch(e => { clearTimeout(timeout); reject(e); });
                }
                eventType = "";
              }
            }
            processEvents();
          }).catch(e => { clearTimeout(timeout); if (!resolved) reject(e); });
        }
        processEvents();
      }).catch(e => { clearTimeout(timeout); reject(e); });
    });
  }

  /** 通过 MCP endpoint 发送消息并获取工具列表 */
  async function sendMcpMessages(endpoint: string, headers: Record<string, string>, signal: AbortSignal): Promise<McpToolInfo[]> {
    const msgHeaders = { ...headers, "Content-Type": "application/json", "Accept": "application/json" };

    // initialize
    const initResp = await fetch(endpoint, {
      method: "POST", headers: msgHeaders, signal,
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "VentoStack", version: "1.0.0" } },
      }),
    });
    if (!initResp.ok) throw new Error(`Initialize failed: HTTP ${initResp.status}`);

    // notifications/initialized
    await fetch(endpoint, {
      method: "POST", headers: msgHeaders, signal,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }).catch(() => {});

    // tools/list
    const toolsResp = await fetch(endpoint, {
      method: "POST", headers: msgHeaders, signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    if (!toolsResp.ok) throw new Error(`tools/list failed: HTTP ${toolsResp.status}`);

    const data = await toolsResp.json() as Record<string, unknown>;
    const result = data.result as { tools?: Array<Record<string, unknown>> } | undefined;
    return (result?.tools ?? []).map(t => ({
      name: t.name as string,
      description: (t.description as string) ?? "",
      inputSchema: t.inputSchema as Record<string, unknown> | undefined,
    }));
  }

  /** 简化 HTTP 模式：直接 POST JSON-RPC */
  async function trySimpleHttp(url: string, headers: Record<string, string>): Promise<McpToolInfo[]> {
    const msgHeaders = { ...headers, "Content-Type": "application/json", "Accept": "application/json" };

    const resp = await fetch(url, {
      method: "POST", headers: msgHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "VentoStack", version: "1.0.0" } },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

    const toolsResp = await fetch(url, {
      method: "POST", headers: msgHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!toolsResp.ok) throw new Error(`tools/list: HTTP ${toolsResp.status}`);

    const data = await toolsResp.json() as Record<string, unknown>;
    const result = data.result as { tools?: Array<Record<string, unknown>> } | undefined;
    return (result?.tools ?? []).map(t => ({
      name: t.name as string,
      description: (t.description as string) ?? "",
      inputSchema: t.inputSchema as Record<string, unknown> | undefined,
    }));
  }

  async function discoverToolsStdio(server: McpServerItem): Promise<McpToolInfo[]> {
    if (!server.command) return [];
    if (validateStdioCommand(server.command, allowedStdioCommands)) return [];
    try {
      const args = server.args ?? [];
      const envVars: Record<string, string> = {};
      if (server.env) Object.assign(envVars, server.env);
      const env = { ...process.env, ...envVars };
      const proc = Bun.spawn([server.command, ...args], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env,
      });

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();


      // initialize
      await proc.stdin.write(encoder.encode(JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "VentoStack", version: "1.0.0" } },
      }) + "\n"));

      // initialized notification
      await proc.stdin.write(encoder.encode(JSON.stringify({
        jsonrpc: "2.0", method: "notifications/initialized",
      }) + "\n"));

      // tools/list
      await proc.stdin.write(encoder.encode(JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
      }) + "\n"));

      const reader = proc.stdout.getReader();
      let response = "";
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const { done, value } = await reader.read();
        if (done) break;
        response += decoder.decode(value, { stream: true });
        // 查找 id:2 的响应
        const lines = response.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === 2 && parsed.result?.tools) {
              proc.kill();
              await proc.exited.catch(() => {});
              return (parsed.result.tools as Array<Record<string, unknown>>).map(t => ({
                name: t.name as string,
                description: (t.description as string) ?? "",
                inputSchema: (t.inputSchema ?? undefined) as Record<string, unknown> | undefined,
              }));
            }
          } catch { /* not complete JSON yet */ }
        }
      }

      proc.kill();
      await proc.exited.catch(() => {});
      return [];
    } catch {
      return [];
    }
  }



  async function refreshTools(id: string, tenantId: string): Promise<McpToolInfo[]> {
    const server = await getById(id, tenantId);
    if (!server) return [];
    const result = await testConnection(id, tenantId);
    return result.tools ?? [];
  }

  return { create, getById, list, update, delete: deleteById, setEnabled, testConnection, refreshTools };
}

function validateMcpConfig(
  params: Pick<CreateMcpServerParams, "transportType" | "command" | "url">,
  allowedStdioCommands: Set<string>,
): void {
  if (params.transportType === "stdio") {
    const error = params.command
      ? validateStdioCommand(params.command, allowedStdioCommands)
      : "stdio 模式需要配置 command";
    if (error) throw aiErrors.sandboxDenied();
  }
  if (params.transportType === "sse" && !params.url) {
    throw aiErrors.sandboxDenied();
  }
}

function validateStdioCommand(command: string, allowedStdioCommands: Set<string>): string | null {
  const normalized = command.trim();
  if (!normalized) return "stdio 模式需要配置 command";
  if (/[\\\s;&|`$<>]/.test(normalized)) return "stdio command 只能是单个可执行文件名或绝对路径";
  const basename = normalized.split("/").pop() ?? normalized;
  if (!allowedStdioCommands.has(normalized) && !allowedStdioCommands.has(basename)) {
    return "stdio command 未在允许列表中";
  }
  return null;
}
