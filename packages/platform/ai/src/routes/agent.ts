/**
 * Agent 路由
 */
import { createRouter, fail, handleError, pageOf, paginated, parseBody, success } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import { join, resolve } from "node:path";
import { readdir, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export interface AgentCrudService {
  create(params: Record<string, unknown>): Promise<{ id: string }>;
  getById(id: string, tenantId: string): Promise<unknown | null>;
  list(params: {
    tenantId: string;
    userId: string;
    isAdmin: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: unknown[]; total: number }>;
  update(id: string, params: Record<string, unknown>, tenantId: string): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
  publish(id: string, tenantId: string): Promise<void>;
}

export function createAgentRoutes(
  agentService: AgentCrudService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
  deps?: { storagePath?: string },
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  router.post(
    "/api/ai/agents",
    perm("ai:agent", "create"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const userId = (ctx.user as { id?: string })?.id ?? "";
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        const result = await agentService.create({
          ...body,
          tenantId,
          createdBy: userId,
        });
        return success(result);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  router.get(
    "/api/ai/agents",
    perm("ai:agent", "list"),
    async (ctx) => {
      const { page, pageSize } = pageOf(
        ctx.query as Record<string, unknown>,
      );
      const userId = (ctx.user as { id?: string })?.id ?? "";
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const roles = (ctx.user as { roles?: string[] })?.roles ?? [];
      const isAdmin = roles.includes("admin");
      const result = await agentService.list({
        tenantId,
        userId,
        isAdmin,
        page,
        pageSize,
      });
      return paginated(result.list, result.total, page, pageSize);
    },
  );

  router.get(
    "/api/ai/agents/:id",
    perm("ai:agent", "list"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
      const agent = await agentService.getById(id, tenantId);
      if (!agent) return fail("Agent 不存在", 404, 404);
      return success(agent);
    },
  );

  // 更新 Agent
  router.put(
    "/api/ai/agents/:id",
    perm("ai:agent", "update"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        const body = await parseBody(ctx.request);
        await agentService.update(id, body, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  router.delete(
    "/api/ai/agents/:id",
    perm("ai:agent", "delete"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        await agentService.delete(id, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  router.post(
    "/api/ai/agents/:id/publish",
    perm("ai:agent", "publish"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? "";
        await agentService.publish(id, tenantId);
        return success(null);
      } catch (e) {
        return handleError(e);
      }
    },
  );

  // ── 工作区文件浏览 ──
  const WORKSPACE_BASE = deps?.storagePath ?? "./data/skills/.workspace";

  // 列出工作区文件
  router.get(
    "/api/ai/agents/:id/workspace/files",
    perm("ai:agent", "list"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const workspaceDir = join(WORKSPACE_BASE, id);
        if (!existsSync(workspaceDir)) return success([]);

        const files: Array<{ path: string; size: number; modifiedAt: string }> = [];
        async function walk(dir: string, rel: string) {
          const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
          for (const item of items) {
            const itemRel = rel ? `${rel}/${item.name}` : item.name;
            const fullPath = join(dir, item.name);
            if (item.isDirectory()) {
              await walk(fullPath, itemRel);
            } else {
              const s = await stat(fullPath).catch(() => null);
              files.push({
                path: itemRel,
                size: s?.size ?? 0,
                modifiedAt: s?.mtime?.toISOString() ?? "",
              });
            }
          }
        }
        await walk(workspaceDir, "");
        return success(files);
      } catch (e) { return handleError(e); }
    },
  );

  // 读取工作区文件内容
  router.get(
    "/api/ai/agents/:id/workspace/file",
    perm("ai:agent", "list"),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const filePath = ((ctx.query as Record<string, string>)?.path ?? "") as string;
        if (!filePath) return fail("path 参数必填", 400, 400);

        const workspaceDir = join(WORKSPACE_BASE, id);
        const fullPath = resolve(join(workspaceDir, filePath));

        // 安全检查：确保路径在 workspace 内
        if (!fullPath.startsWith(resolve(workspaceDir))) {
          return fail("路径不合法", 400, 400);
        }
        if (!existsSync(fullPath)) return fail("文件不存在", 404, 404);

        const content = await readFile(fullPath, "utf-8");
        return success({ path: filePath, content });
      } catch (e) { return handleError(e); }
    },
  );

  return router;
}
