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
import type { ConfigEncryptor } from "@ventostack/core";
import { aiErrors } from "../errors";

/**
 * stdio 子进程环境变量透传白名单
 * 仅透传运行所必需的基础变量，防止 JWT_SECRET / DATABASE_URL / S3 密钥等宿主敏感环境变量
 * 泄露给第三方 MCP 子进程。用户显式配置的 env（ai_mcp_server.env）另行合并。
 */
const CHILD_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "SHELL",
  "USER",
  "LOGNAME",
  "HOSTNAME",
  "NO_COLOR",
  "FORCE_COLOR",
  "BUN_INSTALL",
  "NODE_ENV",
] as const;

/** 构造 stdio 子进程环境：白名单宿主变量 + 用户显式配置项 */
function buildChildEnv(userEnv?: Record<string, string> | null): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  if (userEnv) {
    for (const [k, v] of Object.entries(userEnv)) {
      env[k] = v;
    }
  }
  return env;
}

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
  callTool(
    id: string,
    tenantId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface McpServerServiceDeps {
  db: Database;
  allowedStdioCommands?: string[];
  allowedHttpHosts?: string[];
  /** 敏感字段（env/headers 中的 key/secret/token 等）加密器；不传则明文存储（测试场景） */
  credentialEncryptor?: ConfigEncryptor;
  /** Internal Adapter seam used for alternate transports and deterministic tests. */
  clientFactory?: (server: McpServerItem) => McpClient;
  /** 连接池策略：上限与空闲回收 */
  pool?: {
    /** 同时存活的最大客户端数（默认 16）；超限时淘汰最久未用的客户端 */
    maxClients?: number;
    /** 空闲回收 TTL 毫秒（默认 5 分钟） */
    idleTimeoutMs?: number;
  };
}

const DEFAULT_STDIO_COMMANDS: string[] = [];

/** 敏感字段 key 匹配规则：password/token/secret/key/authorization/credential 等 */
const SENSITIVE_KEY_RE = /password|token|secret|key|authorization|credential/i;

/** 脱敏占位值：对外返回时用于隐藏真实值，写入时须过滤避免覆盖真实密钥 */
const MASK_VALUE = "********";

/** 判断字段名是否敏感（命中则需加密/脱敏） */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

/** 过滤对象中的脱敏占位值（********）：更新时跳过未修改的掩码字段，防止覆盖已存真实值 */
function stripMaskedValues(
  obj: Record<string, string> | null | undefined,
): Record<string, string> | null | undefined {
  if (!obj) return obj;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== MASK_VALUE) out[k] = v;
  }
  return out;
}

/**
 * 合并当前值与更新值：掩码字段（********）沿用当前真实值，其余字段采用新值。
 * update 是整列替换，必须保留掩码字段对应的原值，否则会清空未修改的密钥。
 */
function mergeMaskedValues(
  current: Record<string, string> | null | undefined,
  incoming: Record<string, string> | null | undefined,
): Record<string, string> | null | undefined {
  if (!incoming) return incoming;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming)) {
    out[k] = v === MASK_VALUE ? (current?.[k] ?? v) : v;
  }
  return out;
}

/** 加密对象中的敏感字段值（ENC: 前缀），非敏感字段原样保留 */
async function encryptSecretFields(
  obj: Record<string, string> | null | undefined,
  encryptor?: ConfigEncryptor,
): Promise<Record<string, string> | null> {
  if (!obj || !encryptor) return obj ?? null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = isSensitiveKey(k) && !encryptor.isEncrypted(v) ? await encryptor.encrypt(v) : v;
  }
  return out;
}

/** 解密对象中的敏感字段值（ENC: 前缀还原为明文） */
async function decryptSecretFields(
  obj: Record<string, string> | null | undefined,
  encryptor?: ConfigEncryptor,
): Promise<Record<string, string> | null> {
  if (!obj || !encryptor) return obj ?? null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = isSensitiveKey(k) && encryptor.isEncrypted(v) ? await encryptor.decrypt(v) : v;
  }
  return out;
}

/** 脱敏对象中的敏感字段值（用于对外返回，隐藏真实值但保留 key） */
function maskSecretFields(
  obj: Record<string, string> | null | undefined,
): Record<string, string> | null {
  if (!obj) return obj ?? null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = isSensitiveKey(k) && v ? "********" : v;
  }
  return out;
}

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
  const allowedHttpHosts = new Set(deps.allowedHttpHosts ?? []);
  const maxClients = deps.pool?.maxClients ?? 16;
  const idleTimeoutMs = deps.pool?.idleTimeoutMs ?? 5 * 60_000;
  // 客户端池：key = tenantId:serverId → { client, lastUsed }
  const clients = new Map<string, { client: McpClient; lastUsed: number }>();

  function clientKey(id: string, tenantId: string): string {
    return `${tenantId}:${id}`;
  }

  async function closeClient(id: string, tenantId: string): Promise<void> {
    const key = clientKey(id, tenantId);
    const entry = clients.get(key);
    if (!entry) return;
    clients.delete(key);
    await entry.client.close().catch(() => undefined);
  }

  /** 淘汰最久未用的客户端，直至池大小不高于上限 */
  async function evictToLimit(): Promise<void> {
    while (clients.size > maxClients && clients.size > 0) {
      let lruKey: string | null = null;
      let lruTime = Number.POSITIVE_INFINITY;
      for (const [key, entry] of clients) {
        if (entry.lastUsed < lruTime) {
          lruTime = entry.lastUsed;
          lruKey = key;
        }
      }
      if (lruKey === null) break;
      const entry = clients.get(lruKey);
      if (!entry) break;
      clients.delete(lruKey);
      await entry.client.close().catch(() => undefined);
    }
  }

  // 空闲回收：定时关闭超过 idleTimeoutMs 未使用的客户端
  const cleanupTimer = idleTimeoutMs > 0
    ? setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of [...clients]) {
          if (now - entry.lastUsed > idleTimeoutMs) {
            clients.delete(key);
            void entry.client.close().catch(() => undefined);
          }
        }
      }, Math.min(idleTimeoutMs, 60_000))
    : null;
  cleanupTimer?.unref?.();

  async function persistToolsSnapshot(
    id: string,
    tenantId: string,
    tools: McpToolInfo[],
  ): Promise<void> {
    await db.raw(
      `UPDATE ai_mcp_server SET tools_snapshot = $1, tool_count = $2, status = 'connected', last_error = NULL, updated_at = NOW() WHERE id = $3 AND tenant_id = $4`,
      [JSON.stringify(tools), tools.length, id, tenantId],
    );
  }

  function createClient(server: McpServerItem): McpClient {
    const client = deps.clientFactory?.(server) ?? (server.transportType === "stdio"
      ? createMcpStdioClient(server)
      : createMcpHttpClient(server));
    client.onToolsChanged(() => {
      void client.listTools()
        .then((tools) => persistToolsSnapshot(server.id, server.tenantId, tools))
        .catch(() => undefined);
    });
    return client;
  }

  function getOrCreateClient(server: McpServerItem): McpClient {
    const key = clientKey(server.id, server.tenantId);
    const existing = clients.get(key);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.client;
    }
    const client = createClient(server);
    clients.set(key, { client, lastUsed: Date.now() });
    // 超过上限时淘汰最久未用的客户端，保持池大小有界
    void evictToLimit();
    return client;
  }

  /** 使用客户端时刷新 lastUsed，避免长调用被空闲回收误杀 */
  function touchClient(server: McpServerItem): void {
    const entry = clients.get(clientKey(server.id, server.tenantId));
    if (entry) entry.lastUsed = Date.now();
  }

  async function create(params: CreateMcpServerParams): Promise<McpServerItem> {
    validateMcpConfig(params, allowedStdioCommands, allowedHttpHosts);
    const id = crypto.randomUUID();
    const env = await encryptSecretFields(params.env, deps.credentialEncryptor);
    const headers = await encryptSecretFields(params.headers, deps.credentialEncryptor);
    await db.raw(
      `INSERT INTO ai_mcp_server (id, name, description, transport_type, command, args, env, url, headers, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id, params.name, params.description ?? null, params.transportType,
        params.command ?? null,
        params.args ? JSON.stringify(params.args) : null,
        env ? JSON.stringify(env) : null,
        params.url ?? null,
        headers ? JSON.stringify(headers) : null,
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
    if (rows.length === 0) return null;
    const item = mapRow(rows[0]!);
    item.env = await decryptSecretFields(item.env, deps.credentialEncryptor);
    item.headers = await decryptSecretFields(item.headers, deps.credentialEncryptor);
    return item;
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
    const list: McpServerItem[] = [];
    for (const row of rows) {
      const item = mapRow(row);
      item.env = await decryptSecretFields(item.env, deps.credentialEncryptor);
      item.headers = await decryptSecretFields(item.headers, deps.credentialEncryptor);
      list.push(item);
    }
    return { list, total };
  }

  async function update(id: string, params: UpdateMcpServerParams, tenantId: string): Promise<McpServerItem> {
    const current = await getById(id, tenantId);
    if (!current) throw aiErrors.toolNotFound("mcp-server");
    validateMcpConfig(
      {
        transportType: params.transportType ?? current.transportType,
        command: params.command ?? current.command,
        url: params.url ?? current.url,
      },
      allowedStdioCommands,
      allowedHttpHosts,
    );
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.name !== undefined) { sets.push(`name = $${idx++}`); values.push(params.name); }
    if (params.description !== undefined) { sets.push(`description = $${idx++}`); values.push(params.description); }
    if (params.transportType !== undefined) { sets.push(`transport_type = $${idx++}`); values.push(params.transportType); }
    if (params.command !== undefined) { sets.push(`command = $${idx++}`); values.push(params.command); }
    if (params.args !== undefined) { sets.push(`args = $${idx++}`); values.push(JSON.stringify(params.args)); }
    if (params.env !== undefined) { sets.push(`env = $${idx++}`); values.push(JSON.stringify(await encryptSecretFields(mergeMaskedValues(current.env, params.env), deps.credentialEncryptor))); }
    if (params.url !== undefined) { sets.push(`url = $${idx++}`); values.push(params.url); }
    if (params.headers !== undefined) { sets.push(`headers = $${idx++}`); values.push(JSON.stringify(await encryptSecretFields(mergeMaskedValues(current.headers, params.headers), deps.credentialEncryptor))); }
    if (params.enabled !== undefined) { sets.push(`enabled = $${idx++}`); values.push(params.enabled); }

    if (sets.length === 0) return (await getById(id, tenantId))!;

    await closeClient(id, tenantId);

    sets.push(`updated_at = NOW()`);
    values.push(id, tenantId);
    await db.raw(
      `UPDATE ai_mcp_server SET ${sets.join(", ")} WHERE id = $${idx++} AND tenant_id = $${idx}`,
      values,
    );
    return (await getById(id, tenantId))!;
  }

  async function deleteById(id: string, tenantId: string): Promise<void> {
    await closeClient(id, tenantId);
    await db.raw(`DELETE FROM ai_mcp_server WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    // 清理 agent JSON 悬空引用（ai_agent.mcp_server_ids；ai_agent_mcp 表由外键 CASCADE 处理）
    await db.raw(
      `UPDATE ai_agent
       SET mcp_server_ids = (
         SELECT COALESCE(json_agg(elem), '[]')
         FROM jsonb_array_elements_text(mcp_server_ids::jsonb) elem
         WHERE elem <> $1
       ), updated_at = NOW()
       WHERE tenant_id = $2 AND mcp_server_ids IS NOT NULL`,
      [id, tenantId],
    );
  }

  async function setEnabled(id: string, tenantId: string, enabled: boolean): Promise<void> {
    if (!enabled) await closeClient(id, tenantId);
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
        `UPDATE ai_mcp_server SET status = 'error', last_error = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
        [error, id, tenantId],
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
      const env = buildChildEnv(server.env);
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
      const env = buildChildEnv(server.env);
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
    validateMcpConfig(server, allowedStdioCommands, allowedHttpHosts);
    const client = getOrCreateClient(server);
    touchClient(server);
    const tools = await client.listTools();
    await persistToolsSnapshot(id, tenantId, tools);
    return tools;
  }

  async function callTool(
    id: string,
    tenantId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const server = await getById(id, tenantId);
    if (!server || !server.enabled) throw aiErrors.toolNotFound(toolName);
    validateMcpConfig(server, allowedStdioCommands, allowedHttpHosts);
    if (!server.toolsSnapshot?.some((tool) => tool.name === toolName)) {
      throw aiErrors.toolNotFound(toolName);
    }
    const client = getOrCreateClient(server);
    touchClient(server);
    try {
      return await client.callTool(toolName, args, signal);
    } catch (error) {
      await closeClient(id, tenantId);
      throw error;
    }
  }

  async function close(): Promise<void> {
    if (cleanupTimer) clearInterval(cleanupTimer);
    const active = [...clients.values()];
    clients.clear();
    await Promise.all(active.map((entry) => entry.client.close()));
  }

  return { create, getById, list, update, delete: deleteById, setEnabled, testConnection, refreshTools, callTool, close };
}

export async function callHttpMcpTool(
  server: McpServerItem,
  toolName: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const client = createMcpHttpClient(server);
  try {
    return await client.callTool(toolName, args, signal);
  } finally {
    await client.close();
  }
}

export interface McpClient {
  callTool(toolName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  listTools(signal?: AbortSignal): Promise<McpToolInfo[]>;
  onToolsChanged(handler: () => void): () => void;
  close(): Promise<void>;
}

export type McpHttpClient = McpClient;

export function createMcpHttpClient(server: McpServerItem): McpClient {
  if (!server.url) throw new Error("MCP HTTP URL is required");
  const url = server.url;
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(server.headers ?? {}),
  };
  let initialized: Promise<{ headers: Record<string, string>; sessionId?: string }> | null = null;
  let closed = false;
  const toolsChangedHandlers = new Set<() => void>();

  function handleNotification(notification: Record<string, unknown>): void {
    if (notification.method !== "notifications/tools/list_changed") return;
    for (const handler of toolsChangedHandlers) handler();
  }

  async function initialize(signal?: AbortSignal): Promise<{ headers: Record<string, string>; sessionId?: string }> {
    if (closed) throw new Error("MCP client is closed");
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000);
    const initializeId = crypto.randomUUID();
    const response = await postMcpRequest(
      url,
      baseHeaders,
      {
        jsonrpc: "2.0",
        id: initializeId,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "VentoStack", version: "1.0.0" },
        },
      },
      initializeId,
      requestSignal,
      handleNotification,
    );
    unwrapMcpResponse(response.body);
    const headers = response.sessionId
      ? { ...baseHeaders, "Mcp-Session-Id": response.sessionId }
      : baseHeaders;
    await postMcpNotification(
      url,
      headers,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      requestSignal,
    );
    return { headers, ...(response.sessionId ? { sessionId: response.sessionId } : {}) };
  }

  async function callTool(
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    initialized ??= initialize(signal);
    const session = await initialized;
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000);
    const callId = crypto.randomUUID();
    const response = await postMcpRequest(
      url,
      session.headers,
      { jsonrpc: "2.0", id: callId, method: "tools/call", params: { name: toolName, arguments: args } },
      callId,
      requestSignal,
      handleNotification,
    );
    return unwrapMcpResponse(response.body);
  }

  async function listTools(signal?: AbortSignal): Promise<McpToolInfo[]> {
    initialized ??= initialize(signal);
    const session = await initialized;
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000);
    const id = crypto.randomUUID();
    const response = await postMcpRequest(
      url,
      session.headers,
      { jsonrpc: "2.0", id, method: "tools/list", params: {} },
      id,
      requestSignal,
      handleNotification,
    );
    return parseToolList(response.body);
  }

  function onToolsChanged(handler: () => void): () => void {
    toolsChangedHandlers.add(handler);
    return () => toolsChangedHandlers.delete(handler);
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    if (!initialized) return;
    try {
      const session = await initialized;
      if (!session.sessionId) return;
      await fetch(url, {
        method: "DELETE",
        headers: session.headers,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Closing is best-effort; the client is already unusable locally.
    }
  }

  return { callTool, listTools, onToolsChanged, close };
}

interface McpHttpResponse {
  body: Record<string, unknown>;
  sessionId?: string;
}

async function postMcpRequest(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
  requestId: string,
  signal: AbortSignal,
  onNotification?: (notification: Record<string, unknown>) => void,
): Promise<McpHttpResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw new Error(`MCP request failed with HTTP ${response.status}`);
  const raw = await response.text();
  const body = parseMcpHttpBody(raw, response.headers.get("content-type") ?? "", requestId, onNotification);
  const sessionId = response.headers.get("mcp-session-id") ?? undefined;
  return { body, ...(sessionId ? { sessionId } : {}) };
}

async function postMcpNotification(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw new Error(`MCP notification failed with HTTP ${response.status}`);
}

export function parseMcpHttpBody(
  raw: string,
  contentType: string,
  requestId: string,
  onNotification?: (notification: Record<string, unknown>) => void,
): Record<string, unknown> {
  if (!contentType.includes("text/event-stream")) {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  const candidates = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (typeof parsed.method === "string" && parsed.id === undefined) onNotification?.(parsed);
    if (parsed.id === requestId) return parsed;
  }
  throw new Error(`MCP event stream contained no response for request ${requestId}`);
}

export function createMcpStdioClient(server: McpServerItem): McpClient {
  if (!server.command) throw new Error("MCP stdio command is required");
  const proc = Bun.spawn([server.command, ...(server.args ?? [])], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: buildChildEnv(server.env),
  });
  const encoder = new TextEncoder();
  const pending = new Map<string, {
    resolve(value: Record<string, unknown>): void;
    reject(error: Error): void;
  }>();
  let closed = false;
  let buffer = "";
  const toolsChangedHandlers = new Set<() => void>();

  function rejectPending(error: Error): void {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  const readLoop = (async (): Promise<void> => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let response: Record<string, unknown>;
        try {
          response = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (response.method === "notifications/tools/list_changed" && response.id === undefined) {
          for (const handler of toolsChangedHandlers) handler();
          continue;
        }
        const id = typeof response.id === "string" ? response.id : String(response.id ?? "");
        const request = pending.get(id);
        if (!request) continue;
        pending.delete(id);
        request.resolve(response);
      }
    }
    if (!closed) rejectPending(new Error("MCP process closed"));
  })().catch((error: unknown) => {
    rejectPending(error instanceof Error ? error : new Error(String(error)));
  });
  void new Response(proc.stderr).text().catch(() => undefined);

  async function write(payload: Record<string, unknown>): Promise<void> {
    if (closed) throw new Error("MCP client is closed");
    await proc.stdin.write(encoder.encode(`${JSON.stringify(payload)}\n`));
  }

  async function request(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const id = crypto.randomUUID();
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000);
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const abort = (): void => {
        pending.delete(id);
        reject(new Error("MCP request aborted or timed out"));
      };
      requestSignal.addEventListener("abort", abort, { once: true });
      pending.set(id, {
        resolve: (response) => {
          requestSignal.removeEventListener("abort", abort);
          resolve(response);
        },
        reject: (error) => {
          requestSignal.removeEventListener("abort", abort);
          reject(error);
        },
      });
      void write({ jsonrpc: "2.0", id, method, params }).catch((error: unknown) => {
        pending.delete(id);
        requestSignal.removeEventListener("abort", abort);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  const initialized = (async (): Promise<void> => {
    const response = await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "VentoStack", version: "1.0.0" },
    });
    unwrapMcpResponse(response);
    await write({ jsonrpc: "2.0", method: "notifications/initialized" });
  })();

  async function callTool(
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    await initialized;
    return unwrapMcpResponse(await request("tools/call", { name: toolName, arguments: args }, signal));
  }

  async function listTools(signal?: AbortSignal): Promise<McpToolInfo[]> {
    await initialized;
    return parseToolList(await request("tools/list", {}, signal));
  }

  function onToolsChanged(handler: () => void): () => void {
    toolsChangedHandlers.add(handler);
    return () => toolsChangedHandlers.delete(handler);
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    rejectPending(new Error("MCP client is closed"));
    proc.stdin.end();
    proc.kill();
    await proc.exited.catch(() => undefined);
    await readLoop;
  }

  return { callTool, listTools, onToolsChanged, close };
}

function parseToolList(response: Record<string, unknown>): McpToolInfo[] {
  const error = response.error as { code?: number; message?: string } | undefined;
  if (error) throw new Error(`MCP ${error.code ?? "error"}: ${error.message ?? "tools/list failed"}`);
  const result = response.result as { tools?: Array<Record<string, unknown>> } | undefined;
  return (result?.tools ?? []).flatMap((tool) => {
    if (typeof tool.name !== "string") return [];
    return [{
      name: tool.name,
      description: typeof tool.description === "string" ? tool.description : "",
      ...(typeof tool.inputSchema === "object" && tool.inputSchema !== null
        ? { inputSchema: tool.inputSchema as Record<string, unknown> }
        : {}),
    }];
  });
}

function unwrapMcpResponse(response: Record<string, unknown>): unknown {
  const error = response.error as { code?: number; message?: string } | undefined;
  if (error) throw new Error(`MCP ${error.code ?? "error"}: ${error.message ?? "tool call failed"}`);
  const result = response.result as { content?: unknown; structuredContent?: unknown; isError?: boolean } | undefined;
  if (!result) throw new Error("MCP server returned no result");
  if (result.isError) throw new Error("MCP tool reported an execution error");
  return result.structuredContent ?? result.content ?? result;
}

function validateMcpConfig(
  params: {
    transportType: "stdio" | "sse";
    command?: string | null;
    url?: string | null;
  },
  allowedStdioCommands: Set<string>,
  allowedHttpHosts: Set<string>,
): void {
  if (params.transportType === "stdio") {
    const error = params.command
      ? validateStdioCommand(params.command, allowedStdioCommands)
      : "stdio 模式需要配置 command";
    if (error) throw aiErrors.sandboxDenied();
  }
  if (params.transportType === "sse") {
    if (!params.url) throw aiErrors.sandboxDenied();
    let url: URL;
    try {
      url = new URL(params.url);
    } catch {
      throw aiErrors.sandboxDenied();
    }
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !allowedHttpHosts.has(url.hostname)
    ) {
      throw aiErrors.sandboxDenied();
    }
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
