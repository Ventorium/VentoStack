/**
 * MCP Server 管理路由
 */
import { createRouter, success, paginated, fail, handleError, parseBody, pageOf } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { McpServerItem, McpServerService } from "../services/mcp-server";

/** 对外脱敏：隐藏 env/headers 中敏感字段的真实值（服务层已解密，这里仅做展示脱敏） */
function maskSecrets(item: McpServerItem): McpServerItem {
  const sensitive = (v: Record<string, string> | null | undefined) => {
    if (!v) return v;
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = /password|token|secret|key|authorization|credential/i.test(k) && val ? "********" : val;
    }
    return out;
  };
  return { ...item, env: sensitive(item.env), headers: sensitive(item.headers) };
}

export function createMcpServerRoutes(
  mcpService: McpServerService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // ── 列表 ──
  router.get(
    "/api/ai/mcp-servers",
    perm("ai:mcp-server", "list"),
    async (ctx) => {
      try {
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const q = ctx.query as Record<string, unknown>;
        const { page, pageSize } = pageOf(q);
        const listParams: { page: number; pageSize: number; enabled?: boolean } = { page, pageSize };
        if (q.enabled !== undefined) listParams.enabled = q.enabled === "true" || q.enabled === true;
        const result = await mcpService.list(tenantId, listParams);
        return paginated(result.list.map(maskSecrets), result.total, page, pageSize);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 详情 ──
  router.get(
    "/api/ai/mcp-servers/:id",
    perm("ai:mcp-server", "query"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const server = await mcpService.getById(id, tenantId);
        if (!server) return fail("MCP Server 不存在", 404, 404);
        return success(maskSecrets(server));
      } catch (e) { return handleError(e); }
    },
  );

  // ── 创建 ──
  router.post(
    "/api/ai/mcp-servers",
    perm("ai:mcp-server", "create"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        if (!body.name) return fail("name 必填", 400, 400);
        if (!body.transportType) return fail("transportType 必填", 400, 400);

        const createParams: Record<string, unknown> = {
          name: body.name as string,
          transportType: body.transportType as "stdio" | "sse",
          tenantId,
        };
        if (body.description) createParams.description = body.description as string;
        if (body.command) createParams.command = body.command as string;
        if (body.args) createParams.args = body.args as string[];
        if (body.env) createParams.env = body.env as Record<string, string>;
        if (body.url) createParams.url = body.url as string;
        if (body.headers) createParams.headers = body.headers as Record<string, string>;
        const result = await mcpService.create(createParams as unknown as Parameters<typeof mcpService.create>[0]);
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 更新 ──
  router.put(
    "/api/ai/mcp-servers/:id",
    perm("ai:mcp-server", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const updateParams: Record<string, unknown> = {};
        if (body.name !== undefined) updateParams.name = body.name;
        if (body.description !== undefined) updateParams.description = body.description;
        if (body.transportType !== undefined) updateParams.transportType = body.transportType;
        if (body.command !== undefined) updateParams.command = body.command;
        if (body.args !== undefined) updateParams.args = body.args;
        if (body.env !== undefined) updateParams.env = body.env;
        if (body.url !== undefined) updateParams.url = body.url;
        if (body.headers !== undefined) updateParams.headers = body.headers;
        if (body.enabled !== undefined) updateParams.enabled = body.enabled;
        const result = await mcpService.update(id, updateParams as unknown as Parameters<typeof mcpService.update>[1], tenantId);
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 删除 ──
  router.delete(
    "/api/ai/mcp-servers/:id",
    perm("ai:mcp-server", "delete"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        await mcpService.delete(id, tenantId);
        return success(null);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 启用/禁用 ──
  router.put(
    "/api/ai/mcp-servers/:id/enabled",
    perm("ai:mcp-server", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        await mcpService.setEnabled(id, tenantId, body.enabled as boolean);
        return success(null);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 测试连接 ──
  router.post(
    "/api/ai/mcp-servers/:id/test",
    perm("ai:mcp-server", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const result = await mcpService.testConnection(id, tenantId);
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 刷新工具列表 ──
  router.post(
    "/api/ai/mcp-servers/:id/refresh",
    perm("ai:mcp-server", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "default";
        const tools = await mcpService.refreshTools(id, tenantId);
        return success({ tools, count: tools.length });
      } catch (e) { return handleError(e); }
    },
  );

  return router;
}
