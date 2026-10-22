/**
 * AI 连接器（Connectors）服务
 *
 * 连接器 = 预设目录元数据 + 授权流 + 托管的 MCP 接入。
 * 连接成功后落地为一条 origin=connector 的 ai_mcp_server 记录，
 * Agent 绑定 / 会话勾选 / 工具发现 / 审批全部复用现有 MCP 执行面。
 *
 * 安全边界：
 * - scope=user 只能操作本人绑定；scope=tenant 需 ai:connector:manage 权限（路由层守卫）
 * - OAuth client_secret 不入库，由环境变量提供（auth_template.client_secret_env）
 * - 凭证加密落库（credentialEncryptor），account_hint 仅脱敏提示
 */
import type { ConfigEncryptor } from "@ventostack/core";
import type { Database } from "@ventostack/database";
import { aiErrors } from "../errors";
import type { McpServerService } from "./mcp-server";

/** OAuth state 在缓存中的 TTL（秒），防重放 */
const OAUTH_STATE_TTL = 600;
/** 绑定的 OAuth token 在过期前多少秒视为需要刷新 */
const TOKEN_REFRESH_LEEWAY_SECONDS = 120;

/** 目录缓存键前缀（连接器目录是平台元数据，变化极少） */
const CATALOG_CACHE_PREFIX = "ai:connector:catalog:";

// ── 类型 ──────────────────────────────────────────────

export interface ConnectorCatalogItem {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  authType: "oauth2" | "api_key" | "personal_token" | "custom_fields";
  authTemplate: ConnectorAuthTemplate | null;
  transport: string;
  mcpUrl: string | null;
  builtIn: boolean;
  sortOrder: number;
  enabled: boolean;
  /** 当前请求者在该连接器上的绑定状态（listCatalog 时合并） */
  bindingStatus: ConnectorBindingStatus | null;
}

export interface ConnectorAuthTemplate {
  // oauth2
  authorize_url?: string;
  token_url?: string;
  scope?: string;
  client_id_env?: string;
  client_secret_env?: string;
  userinfo_url?: string;
  // api_key / personal_token / custom_fields
  fields?: Array<{ key: string; label: string; secret?: boolean; placeholder?: string; help?: string }>;
}

export type ConnectorBindingStatus =
  | "pending"
  | "connected"
  | "expired"
  | "revoked"
  | "error";

export interface ConnectorBindingItem {
  id: string;
  connectorId: string;
  connectorKind: string;
  connectorName: string;
  scope: "tenant" | "user";
  ownerId: string | null;
  displayName: string | null;
  status: ConnectorBindingStatus;
  accountHint: string | null;
  /** 对应的托管 MCP server id（连接成功后创建） */
  mcpServerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorServiceDeps {
  db: Database;
  mcpServerService: McpServerService;
  credentialEncryptor?: ConfigEncryptor;
  /** OAuth state 暂存（需支持 TTL）。键值字符串存储。 */
  stateStore?: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    delete?(key: string): Promise<void>;
  };
  /** 部署外部地址，用于拼接 OAuth redirect_uri，如 https://admin.example.com */
  publicBaseUrl?: string;
}

// ── 服务 ──────────────────────────────────────────────

export function createConnectorService(deps: ConnectorServiceDeps) {
  const { db, mcpServerService } = deps;
  const encryptor = deps.credentialEncryptor;

  function mapCatalogRow(r: Record<string, unknown>): Omit<ConnectorCatalogItem, "bindingStatus"> {
    return {
      id: r.id as string,
      kind: r.kind as string,
      name: r.name as string,
      description: (r.description as string) ?? null,
      category: r.category as string,
      icon: (r.icon as string) ?? null,
      authType: r.auth_type as ConnectorCatalogItem["authType"],
      authTemplate: (r.auth_template as ConnectorAuthTemplate | null) ?? null,
      transport: (r.transport as string) ?? "remote",
      mcpUrl: (r.mcp_url as string) ?? null,
      builtIn: (r.built_in as boolean) ?? false,
      sortOrder: Number(r.sort_order ?? 0),
      enabled: (r.enabled as boolean) ?? true,
    };
  }

  function mapBindingRow(r: Record<string, unknown>): ConnectorBindingItem {
    return {
      id: r.id as string,
      connectorId: r.connector_id as string,
      connectorKind: (r.connector_kind as string) ?? "",
      connectorName: (r.connector_name as string) ?? "",
      scope: r.scope as "tenant" | "user",
      ownerId: (r.owner_id as string) ?? null,
      displayName: (r.display_name as string) ?? null,
      status: r.status as ConnectorBindingStatus,
      accountHint: (r.account_hint as string) ?? null,
      mcpServerId: (r.mcp_server_id as string) ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at ?? ""),
    };
  }

  async function encryptCredentials(plain: Record<string, unknown>): Promise<string> {
    const json = JSON.stringify(plain);
    return encryptor ? await encryptor.encrypt(json) : json;
  }

  async function decryptCredentials(stored: string): Promise<Record<string, unknown>> {
    const raw = encryptor && encryptor.isEncrypted(stored) ? await encryptor.decrypt(stored) : stored;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  /** 读取绑定凭证并确保 access_token 有效（惰性刷新） */
  async function resolveAccessToken(
    binding: {
      id: string;
      connector_id: string;
      credentials: string | null;
    },
    tenantId: string,
  ): Promise<{ token: string; tokenType?: string | undefined }> {
    const creds = await decryptCredentials(binding.credentials ?? "");
    const accessToken = creds.access_token as string | undefined;
    if (!accessToken) throw aiErrors.connectorBadRequest("连接器凭证缺失");

    const expiresAt = creds.expires_at as number | undefined;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (expiresAt && expiresAt - nowSeconds > TOKEN_REFRESH_LEEWAY_SECONDS) {
      return { token: accessToken, tokenType: creds.token_type as string | undefined };
    }

    // 需要刷新：oauth2 + refresh_token
    const refreshToken = creds.refresh_token as string | undefined;
    if (!refreshToken) {
      throw aiErrors.connectorBadRequest("连接器授权已过期，请重新授权");
    }
    const connector = await getCatalogById(binding.connector_id, tenantId);
    const tpl = connector?.authTemplate;
    const tokenUrl = tpl?.token_url;
    const secretEnv = tpl?.client_secret_env;
    const clientSecret = secretEnv ? process.env[secretEnv] : undefined;
    if (!tokenUrl || !clientSecret) {
      throw aiErrors.connectorBadRequest("连接器配置不完整，无法刷新令牌");
    }

    const clientId = tpl?.client_id_env ? process.env[tpl.client_id_env] : undefined;
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_secret: clientSecret,
      ...(clientId ? { client_id: clientId } : {}),
    });
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    if (!res.ok) {
      await markBindingStatus(binding.id, "expired", `refresh_token failed: HTTP ${res.status}`);
      throw aiErrors.connectorBadRequest("连接器授权已过期，请重新授权");
    }
    const data = (await res.json()) as Record<string, unknown>;
    const nextAccess = data.access_token as string | undefined;
    if (!nextAccess) {
      await markBindingStatus(binding.id, "error", "refresh_token response missing access_token");
      throw aiErrors.connectorBadRequest("连接器刷新令牌响应异常");
    }
    const nextCreds = {
      ...creds,
      access_token: nextAccess,
      token_type: (data.token_type as string) ?? creds.token_type,
      expires_at: data.expires_in
        ? nowSeconds + Number(data.expires_in)
        : (creds.expires_at as number | undefined),
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    };
    await db.raw(
      `UPDATE ai_connector_binding SET credentials = $1, status = 'connected', last_refresh_at = NOW(), last_error = NULL, updated_at = NOW() WHERE id = $2`,
      [await encryptCredentials(nextCreds), binding.id],
    );
    return { token: nextAccess, tokenType: nextCreds.token_type as string | undefined };
  }

  async function markBindingStatus(id: string, status: ConnectorBindingStatus, error?: string): Promise<void> {
    await db.raw(
      `UPDATE ai_connector_binding SET status = $1, last_error = $2, updated_at = NOW() WHERE id = $3`,
      [status, error ?? null, id],
    );
  }

  async function getCatalogById(id: string, tenantId: string): Promise<Omit<ConnectorCatalogItem, "bindingStatus"> | null> {
    const cacheKey = `${CATALOG_CACHE_PREFIX}${tenantId}:${id}`;
    if (deps.stateStore) {
      const cached = await deps.stateStore.get(cacheKey);
      if (cached) return JSON.parse(cached) as Omit<ConnectorCatalogItem, "bindingStatus">;
    }
    const rows = (await db.raw(
      `SELECT * FROM ai_connector_catalog WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [id, tenantId],
    )) as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    const item = mapCatalogRow(rows[0]!);
    await deps.stateStore?.set(cacheKey, JSON.stringify(item), 300);
    return item;
  }

  async function getCatalogByKind(kind: string, tenantId: string): Promise<Omit<ConnectorCatalogItem, "bindingStatus"> | null> {
    const rows = (await db.raw(
      `SELECT * FROM ai_connector_catalog WHERE kind = $1 AND tenant_id = $2 AND enabled = TRUE LIMIT 1`,
      [kind, tenantId],
    )) as Array<Record<string, unknown>>;
    return rows.length > 0 ? mapCatalogRow(rows[0]!) : null;
  }

  /** 当前请求者可用的绑定：本人（user）+ 本租户（tenant）。跨租户一律不可见。 */
  async function listMyBindings(userId: string, tenantId: string): Promise<ConnectorBindingItem[]> {
    const rows = (await db.raw(
      `SELECT b.*, c.kind AS connector_kind, c.name AS connector_name, m.id AS mcp_server_id
       FROM ai_connector_binding b
       JOIN ai_connector_catalog c ON c.id = b.connector_id
       LEFT JOIN ai_mcp_server m ON m.connector_binding_id = b.id AND m.origin = 'connector'
       WHERE b.tenant_id = $1
         AND ((b.scope = 'user' AND b.owner_id = $2) OR b.scope = 'tenant')
       ORDER BY c.sort_order ASC, b.created_at DESC`,
      [tenantId, userId],
    )) as Array<Record<string, unknown>>;
    return rows.map(mapBindingRow);
  }

  return {
    /** 目录列表：内置目录 + 当前请求者绑定状态合并 */
    async listCatalog(userId: string, tenantId: string): Promise<ConnectorCatalogItem[]> {
      const rows = (await db.raw(
        `SELECT * FROM ai_connector_catalog
         WHERE tenant_id = $1 AND enabled = TRUE AND transport = 'remote'
         ORDER BY sort_order ASC, name ASC`,
        [tenantId],
      )) as Array<Record<string, unknown>>;

      const bindings = await listMyBindings(userId, tenantId);
      const statusByConnector = new Map<string, ConnectorBindingStatus>();
      for (const b of bindings) {
        // 同 kind 多绑定时取 connected 优先
        const prev = statusByConnector.get(b.connectorKind);
        if (!prev || (b.status === "connected" && prev !== "connected")) {
          statusByConnector.set(b.connectorKind, b.status);
        }
      }

      return rows.map((r) => {
        const item = mapCatalogRow(r);
        return { ...item, bindingStatus: statusByConnector.get(item.kind) ?? null };
      });
    },

    async listBindings(userId: string, tenantId: string): Promise<ConnectorBindingItem[]> {
      return listMyBindings(userId, tenantId);
    },

    /**
     * 发起 OAuth 授权：返回授权跳转 URL（前端 popup 打开后轮询绑定状态）。
     * 仅支持 oauth2 类型；api_key 类直接走 connectWithApiKey。
     */
    async beginOAuthConnect(
      kind: string,
      userId: string,
      tenantId: string,
    ): Promise<{ redirectUrl: string; state: string }> {
      const connector = await getCatalogByKind(kind, tenantId);
      if (!connector) throw aiErrors.connectorNotFound();
      if (connector.authType !== "oauth2") throw aiErrors.connectorBadRequest("该连接器不支持 OAuth 授权");
      if (connector.transport !== "remote") throw aiErrors.connectorBadRequest("该连接器传输模式暂不支持");
      const tpl = connector.authTemplate ?? {};
      if (!tpl.authorize_url || !tpl.token_url) throw aiErrors.connectorBadRequest("连接器 OAuth 配置不完整");

      const clientId = tpl.client_id_env ? process.env[tpl.client_id_env] : undefined;
      if (!clientId) throw aiErrors.connectorBadRequest(`缺少环境变量 ${tpl.client_id_env ?? "client_id"}`);

      // redirect_uri 必须是第三方平台预先注册的绝对地址；未配置公网地址时 fail-closed，
      // 避免发出相对路径导致 authorize 阶段静默失败
      if (!deps.publicBaseUrl) throw aiErrors.connectorBadRequest("未配置对外访问地址（publicBaseUrl），无法发起 OAuth 授权");

      const state = crypto.randomUUID();
      const redirectUri = `${deps.publicBaseUrl.replace(/\/$/, "")}/api/ai/connectors/oauth/callback`;
      const payload = JSON.stringify({ kind, userId, tenantId, redirectUri });
      if (!deps.stateStore) throw aiErrors.connectorBadRequest("OAuth state 存储未配置");
      await deps.stateStore.set(`ai:connector:oauth:state:${state}`, payload, OAUTH_STATE_TTL);

      const url = new URL(tpl.authorize_url);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);
      if (tpl.scope) url.searchParams.set("scope", tpl.scope);
      return { redirectUrl: url.toString(), state };
    },

    /** OAuth 回调：换 token、创建绑定与托管 MCP。tenantId 从 state payload 解析（匿名端点无 ctx.user）。 */
    async handleOAuthCallback(
      state: string,
      code: string,
    ): Promise<{ displayName: string; status: string }> {
      if (!deps.stateStore) throw aiErrors.connectorBadRequest("OAuth state 存储未配置");
      const stateKey = `ai:connector:oauth:state:${state}`;
      const raw = await deps.stateStore.get(stateKey);
      if (!raw) throw aiErrors.connectorBadRequest("OAuth state 无效或已过期");
      await deps.stateStore.delete?.(stateKey);

      const payload = JSON.parse(raw) as { kind: string; userId: string; tenantId: string; redirectUri: string };
      const tenantId = payload.tenantId;
      const connector = await getCatalogByKind(payload.kind, tenantId);
      if (!connector) throw aiErrors.connectorNotFound();
      const tpl = connector.authTemplate ?? {};
      const clientSecret = tpl.client_secret_env ? process.env[tpl.client_secret_env] : undefined;
      const clientId = tpl.client_id_env ? process.env[tpl.client_id_env] : undefined;
      if (!clientSecret || !clientId || !tpl.token_url) throw aiErrors.connectorBadRequest("连接器 OAuth 配置不完整");

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: payload.redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });
      const res = await fetch(tpl.token_url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: body.toString(),
      });
      if (!res.ok) {
        throw aiErrors.connectorBadRequest(`OAuth token 交换失败: HTTP ${res.status}`);
      }
      const tokenData = (await res.json()) as Record<string, unknown>;
      const accessToken = tokenData.access_token as string | undefined;
      if (!accessToken) throw aiErrors.connectorBadRequest("OAuth 响应缺少 access_token");

      // 可选：拉取用户信息生成 account_hint（仅脱敏）
      let accountHint: string | null = null;
      if (tpl.userinfo_url) {
        try {
          const ui = await fetch(tpl.userinfo_url, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          });
          if (ui.ok) {
            const info = (await ui.json()) as Record<string, unknown>;
            const email =
              (info.email as string) ??
              (info.data as Record<string, unknown> | undefined)?.email ??
              (info.login as string);
            if (typeof email === "string" && email.length > 0) {
              accountHint = email.includes("@")
                ? `${email[0]}***@${email.split("@")[1]}`
                : `${email.slice(0, 2)}***`;
            }
          }
        } catch {
          // 用户信息拉取失败不影响主流程
        }
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      const credentials = {
        access_token: accessToken,
        token_type: (tokenData.token_type as string) ?? "Bearer",
        ...(tokenData.refresh_token ? { refresh_token: tokenData.refresh_token } : {}),
        ...(tokenData.expires_in ? { expires_at: nowSeconds + Number(tokenData.expires_in) } : {}),
        ...(tokenData.scope ? { scope: tokenData.scope } : {}),
      };

      return finishConnect({
        connector,
        scope: "user",
        ownerId: payload.userId,
        credentials,
        accountHint,
        tenantId,
      });
    },

    /**
     * API Key / personal_token / custom_fields 类连接：按 auth_template.fields 校验字段并加密入库。
     */
    async connectWithCredentials(
      kind: string,
      userId: string,
      values: Record<string, string>,
      tenantId: string,
    ): Promise<{ displayName: string; status: string }> {
      const connector = await getCatalogByKind(kind, tenantId);
      if (!connector) throw aiErrors.connectorNotFound();
      if (connector.authType === "oauth2") throw aiErrors.connectorBadRequest("该连接器请使用 OAuth 授权");
      if (connector.transport !== "remote") throw aiErrors.connectorBadRequest("该连接器传输模式暂不支持");

      const fields = connector.authTemplate?.fields ?? [];
      if (fields.length === 0) throw aiErrors.connectorBadRequest("连接器未定义凭证字段");
      const credentials: Record<string, string> = {};
      for (const f of fields) {
        const v = values[f.key];
        if (!v || typeof v !== "string" || v.trim().length === 0) {
          throw aiErrors.connectorBadRequest(`缺少字段: ${f.label}`);
        }
        if (v.length > 1024) throw aiErrors.connectorBadRequest(`字段过长: ${f.label}`);
        credentials[f.key] = v.trim();
      }

      return finishConnect({
        connector,
        scope: "user",
        ownerId: userId,
        credentials,
        accountHint: null,
        tenantId,
      });
    },

    /** 解绑：仅本人 user 绑定可解；级联停用托管 MCP（不删除历史勾选）。 */
    async disconnect(bindingId: string, userId: string, tenantId: string): Promise<void> {
      const rows = (await db.raw(
        `SELECT b.*, m.id AS mcp_server_id FROM ai_connector_binding b
         LEFT JOIN ai_mcp_server m ON m.connector_binding_id = b.id AND m.origin = 'connector'
         WHERE b.id = $1 AND b.tenant_id = $2 LIMIT 1`,
        [bindingId, tenantId],
      )) as Array<Record<string, unknown> & { mcp_server_id?: string | null }>;
      const binding = rows[0];
      if (!binding) throw aiErrors.connectorNotFound();

      if (binding.scope === "user" && binding.owner_id !== userId) {
        throw aiErrors.connectorForbidden("无权解绑他人的连接器");
      }

      await db.raw(`UPDATE ai_connector_binding SET status = 'revoked', updated_at = NOW() WHERE id = $1`, [bindingId]);
      if (binding.mcp_server_id) {
        await mcpServerService.setEnabled(binding.mcp_server_id as string, tenantId, false);
      }
    },

    /**
     * 供 mcp-server 出站前解析 Authorization 头：
     * 绑定有效则返回解密后的 Bearer token；过期则惰性刷新；失败 fail-closed。
     */
    async resolveAuthHeaders(mcpServerId: string, tenantId: string): Promise<Record<string, string> | null> {
      const rows = (await db.raw(
        `SELECT b.* FROM ai_mcp_server m
         JOIN ai_connector_binding b ON b.id = m.connector_binding_id
         WHERE m.id = $1 AND m.origin = 'connector' AND m.enabled = TRUE AND b.tenant_id = $2 LIMIT 1`,
        [mcpServerId, tenantId],
      )) as Array<Record<string, unknown>>;
      const binding = rows[0];
      if (!binding) return null;
      if (binding.status === "revoked" || binding.status === "expired") return null;

      const { token, tokenType } = await resolveAccessToken(
        binding as { id: string; connector_id: string; credentials: string | null },
        tenantId,
      );
      return { Authorization: `${tokenType ?? "Bearer"} ${token}` };
    },
  };

  /** 连接收尾：upsert 绑定 + 创建/更新托管 MCP + 触发一次工具发现 */
  async function finishConnect(params: {
    connector: Omit<ConnectorCatalogItem, "bindingStatus">;
    scope: "tenant" | "user";
    ownerId: string;
    credentials: Record<string, unknown>;
    accountHint: string | null;
    tenantId: string;
  }): Promise<{ displayName: string; status: string }> {
    const { connector, scope, ownerId, credentials, accountHint, tenantId } = params;
    if (!connector.mcpUrl) throw aiErrors.connectorBadRequest("连接器未配置 MCP 端点");

    // 查已有绑定（同 connector + scope + owner）
    const existing = (await db.raw(
      `SELECT id FROM ai_connector_binding
       WHERE connector_id = $1 AND scope = $2 AND COALESCE(owner_id, tenant_id) = $3 AND tenant_id = $4
       LIMIT 1`,
      [connector.id, scope, ownerId, tenantId],
    )) as Array<{ id: string }>;

    const credentialsEncrypted = await encryptCredentials(credentials);
    let bindingId: string;
    if (existing.length > 0) {
      bindingId = existing[0]!.id;
      await db.raw(
        `UPDATE ai_connector_binding SET
           credentials = $1, account_hint = $2, status = 'connected', last_error = NULL,
           last_refresh_at = NOW(), updated_at = NOW()
         WHERE id = $3`,
        [credentialsEncrypted, accountHint, bindingId],
      );
    } else {
      bindingId = crypto.randomUUID();
      await db.raw(
        `INSERT INTO ai_connector_binding
           (id, connector_id, scope, owner_id, display_name, status, credentials, account_hint, tenant_id)
         VALUES ($1,$2,$3,$4,$5,'connected',$6,$7,$8)`,
        [
          bindingId,
          connector.id,
          scope,
          scope === "user" ? ownerId : null,
          scope === "user" ? `我的 ${connector.name}` : `${connector.name}（租户）`,
          credentialsEncrypted,
          accountHint,
          tenantId,
        ],
      );
    }

    // 创建/复用托管 MCP：URL 固定为目录 mcp_url，凭证由 resolveAuthHeaders 运行时注入。
    // 任一步失败时把绑定置 error（含原因）并重抛，避免「已连接但无托管 MCP」的孤儿状态
    let mcpId: string;
    try {
      const existingMcp = (await db.raw(
        `SELECT id FROM ai_mcp_server WHERE connector_binding_id = $1 AND origin = 'connector' LIMIT 1`,
        [bindingId],
      )) as Array<{ id: string }>;

      if (existingMcp.length > 0) {
        mcpId = existingMcp[0]!.id;
        await mcpServerService.setEnabled(mcpId, tenantId, true);
      } else {
        const created = await mcpServerService.create({
          name: `${connector.name}（连接器）`,
          description: `${connector.description ?? connector.name} · 由连接器托管`,
          transportType: "sse",
          url: connector.mcpUrl,
          headers: {},
          tenantId,
        });
        mcpId = created.id;
        await db.raw(
          `UPDATE ai_mcp_server SET connector_binding_id = $1, origin = 'connector' WHERE id = $2`,
          [bindingId, mcpId],
        );
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await markBindingStatus(bindingId, "error", `托管 MCP 创建失败：${reason}`).catch(() => undefined);
      throw e;
    }

    // 触发一次工具发现（失败不阻断连接，状态由 mcp 服务自更新为 error）
    try {
      await mcpServerService.refreshTools(mcpId, tenantId);
    } catch {
      // 工具发现失败留给 mcp-server 状态机与前端重试
    }

    const displayName =
      scope === "user" ? `我的 ${connector.name}` : `${connector.name}（租户）`;
    return { displayName, status: "connected" };
  }
}

export type ConnectorService = ReturnType<typeof createConnectorService>;
