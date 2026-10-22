/**
 * AI 连接器（Connectors）路由
 *
 * 受保护端点全部走 authMiddleware + perm（RBAC）；scope=user 的绑定归属由 ctx.user.id 强制注入，
 * 不接受请求参数。OAuth 回调 /api/ai/connectors/oauth/callback 是唯一匿名端点（仅校验 state）。
 *
 * 注意：不能使用 router.use(authMiddleware) —— core 路由器的 use() 会作用到该 router 的全部路由
 * （含匿名回调），认证与权限中间件必须逐路由挂载。
 *
 * 路由签名必须遵循 core 的规范形态 `method(path, routeDoc, handler, ...middleware)`：
 * RouteConfig 对象只能作第二参；若把中间件放在 handler 前面，router 的参数解析会把
 * 第一个中间件当作 handler、真实 handler 塞进中间件链，导致 perm 权限检查被静默绕过。
 */
import { createRouter, fail, handleError, parseBody, success } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { ConnectorService } from "../services/connector";
import { routeDoc } from "./schema";

function currentUser(ctx: { user?: unknown }): { id: string; tenantId: string } | null {
  const u = ctx.user as { id?: string; tenantId?: string } | undefined;
  return u?.id ? { id: u.id, tenantId: u.tenantId ?? "default" } : null;
}

export function createConnectorRoutes(
  connectorService: ConnectorService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();

  // ── OAuth 回调（匿名；state 一次性 + tenant 绑定，防 CSRF/重放）──
  router.get(
    "/api/ai/connectors/oauth/callback",
    routeDoc("OAuth 授权回调（匿名端点；一次性 state 防 CSRF/重放）", {
      query: {
        state: { type: "string", required: true, description: "一次性 state（绑定发起用户与租户）" },
        code: { type: "string", required: true, description: "授权码" },
      },
    }),
    async (ctx) => {
      try {
        const q = ctx.query as Record<string, unknown>;
        const state = typeof q.state === "string" ? q.state : "";
        const code = typeof q.code === "string" ? q.code : "";
        if (!state || !code) return fail("OAuth 回调参数缺失", 400, 400);
        const result = await connectorService.handleOAuthCallback(state, code);
        // popup 场景：返回一段脚本通知 opener 并关闭窗口（前端轮询拿最终状态）
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>授权完成</title></head>
<body><script>
  try { window.opener && window.opener.postMessage({ type: "connector-oauth", status: ${JSON.stringify(result.status)}, displayName: ${JSON.stringify(result.displayName)} }, window.location.origin); } catch (e) {}
  window.close();
</script><p>授权完成，可关闭本窗口。</p></body></html>`;
        return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // ── 目录（含当前请求者绑定状态）──
  router.get(
    "/api/ai/connectors/catalog",
    routeDoc("获取连接器目录（含当前用户绑定状态）"),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        if (!user) return fail("未登录", 401, 401);
        const list = await connectorService.listCatalog(user.id, user.tenantId);
        return success(list);
      } catch (e) {
        return handleError(e);
      }
    },
    authMiddleware,
    perm("ai:connector", "list"),
  );

  // ── 我的绑定列表 ──
  router.get(
    "/api/ai/connectors/bindings",
    routeDoc("获取当前用户的连接器绑定列表"),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        if (!user) return fail("未登录", 401, 401);
        const list = await connectorService.listBindings(user.id, user.tenantId);
        return success(list);
      } catch (e) {
        return handleError(e);
      }
    },
    authMiddleware,
    perm("ai:connector", "list"),
  );

  // ── 发起 OAuth 连接：返回授权跳转 URL（前端 popup 打开）──
  router.post(
    "/api/ai/connectors/:kind/connect",
    routeDoc("发起连接器 OAuth 授权（返回授权跳转 URL，由前端 popup 打开）"),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        if (!user) return fail("未登录", 401, 401);
        const kind = (ctx.params as Record<string, string>).kind!;
        const result = await connectorService.beginOAuthConnect(kind, user.id, user.tenantId);
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
    authMiddleware,
    perm("ai:connector", "connect"),
  );

  // ── API Key / personal_token 类连接 ──
  router.post(
    "/api/ai/connectors/:kind/credentials",
    routeDoc("以 API Key / 个人令牌连接连接器", {
      body: {
        values: {
          type: "object",
          required: true,
          description: "凭证字段键值对（字段键以目录 auth_template.fields 为准）",
        },
      },
    }),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        if (!user) return fail("未登录", 401, 401);
        const kind = (ctx.params as Record<string, string>).kind!;
        const body = await parseBody<{ values?: Record<string, string> }>(ctx.request);
        const values = body?.values ?? {};
        const result = await connectorService.connectWithCredentials(kind, user.id, values, user.tenantId);
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
    authMiddleware,
    perm("ai:connector", "connect"),
  );

  // ── 解绑 ──
  router.delete(
    "/api/ai/connectors/bindings/:id",
    routeDoc("解绑连接器（级联停用托管 MCP）"),
    async (ctx) => {
      try {
        const user = currentUser(ctx);
        if (!user) return fail("未登录", 401, 401);
        const id = (ctx.params as Record<string, string>).id!;
        await connectorService.disconnect(id, user.id, user.tenantId);
        return success({ ok: true });
      } catch (e) {
        return handleError(e);
      }
    },
    authMiddleware,
    perm("ai:connector", "disconnect"),
  );

  return router;
}
