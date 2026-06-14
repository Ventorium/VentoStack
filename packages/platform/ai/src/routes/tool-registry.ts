/**
 * 工具注册表路由
 * 列出系统已注册的所有内置工具
 */
import { createRouter, success, fail, handleError } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { ToolRegistry } from "../tool-registry";

export function createToolRegistryRoutes(
  toolRegistry: ToolRegistry,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // ── 列出所有工具 ──
  router.get(
    "/api/ai/tools",
    perm("ai:tool", "list"),
    async (ctx) => {
      try {
        const tools = toolRegistry.list();
        const result = tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          riskLevel: t.riskLevel ?? "low",
          requiresApproval: t.requiresApproval ?? false,
          timeout: t.timeout ?? 30_000,
        }));
        return success(result);
      } catch (e) { return handleError(e); }
    },
  );

  // ── 工具详情（含 JSON Schema） ──
  router.get(
    "/api/ai/tools/:name",
    perm("ai:tool", "query"),
    async (ctx) => {
      try {
        const name = (ctx.params as Record<string, string>).name!;
        const tool = toolRegistry.get(name);
        if (!tool) return success(null);
        const schemas = toolRegistry.toJSONSchema();
        const schema = schemas.find(s => s.name === name);
        return success({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          riskLevel: tool.riskLevel ?? "low",
          requiresApproval: tool.requiresApproval ?? false,
          timeout: tool.timeout ?? 30_000,
          jsonSchema: schema?.parameters ?? null,
        });
      } catch (e) { return handleError(e); }
    },
  );

  return router;
}
