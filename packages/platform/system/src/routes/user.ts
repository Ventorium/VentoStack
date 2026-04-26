/**
 * @ventostack/system - 用户管理路由
 *
 * 使用 router.use(authMiddleware) 注册为组中间件，
 * 避免 get/post 等快捷方法将 authMiddleware 误识别为 handler。
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { UserService } from "../services/user";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

export function createUserRoutes(
  userService: UserService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  router.get("/api/system/users", perm("system", "user:list"), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const result = await userService.list({
      page,
      pageSize,
      username: (ctx.query as Record<string, unknown>).username as string | undefined,
      status: (ctx.query as Record<string, unknown>).status as number | undefined,
      deptId: (ctx.query as Record<string, unknown>).deptId as string | undefined,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  router.get("/api/system/users/:id", perm("system", "user:query"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const user = await userService.getById(id);
    if (!user) return fail("User not found", 404, 404);
    return ok(user);
  });

  router.post("/api/system/users", perm("system", "user:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await userService.create(body as any);
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Create failed", 400);
    }
  });

  router.put("/api/system/users/:id", perm("system", "user:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const body = await parseBody(ctx.request);
    await userService.update(id, body as any);
    return ok(null);
  });

  router.delete("/api/system/users/:id", perm("system", "user:delete"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    await userService.delete(id);
    return ok(null);
  });

  router.put("/api/system/users/:id/reset-pwd", perm("system", "user:resetPwd"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const body = await parseBody(ctx.request);
    await userService.resetPassword(id, body.newPassword as string);
    return ok(null);
  });

  router.put("/api/system/users/:id/status", perm("system", "user:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const body = await parseBody(ctx.request);
    await userService.updateStatus(id, body.status as number);
    return ok(null);
  });

  return router;
}
