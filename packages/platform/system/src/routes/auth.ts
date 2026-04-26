/**
 * @ventostack/system - 认证路由
 *
 * 公开端点（login/register/forgot-password/reset-password）直接在 router 上注册。
 * 需认证端点（logout/MFA）在子 router 上通过 use(authMiddleware) 保护。
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { AuthService } from "../services/auth";
import { ok, fail, parseBody } from "./common";

export function createAuthRoutes(
  authService: AuthService,
  authMiddleware: Middleware,
): Router {
  const router = createRouter();

  // ---- 公开端点 ----
  router.post("/api/auth/login", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await authService.login({
        username: body.username as string,
        password: body.password as string,
        ip: ctx.request.headers.get("x-forwarded-for") ?? "unknown",
        userAgent: ctx.request.headers.get("user-agent") ?? "unknown",
        deviceType: body.deviceType as string | undefined,
      });
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Login failed";
      return fail(msg, 401, 401);
    }
  });

  router.post("/api/auth/register", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await authService.register({
        username: body.username as string,
        password: body.password as string,
        email: body.email as string | undefined,
        phone: body.phone as string | undefined,
      });
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Register failed";
      return fail(msg, 400);
    }
  });

  router.post("/api/auth/forgot-password", async (ctx) => {
    const body = await parseBody(ctx.request);
    return ok({ email: body.email });
  });

  router.post("/api/auth/reset-password", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      await authService.resetPassword(body.userId as string, body.newPassword as string);
      return ok(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Reset failed";
      return fail(msg, 400);
    }
  });

  router.post("/api/auth/refresh", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await authService.refreshToken(body.refreshToken as string);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Refresh failed";
      return fail(msg, 401, 401);
    }
  });

  // ---- 需认证端点 ----
  const protectedRouter = createRouter();
  protectedRouter.use(authMiddleware);

  protectedRouter.post("/api/auth/logout", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (user) {
      await authService.logout(user.id, "");
    }
    return ok(null);
  });

  // MFA
  protectedRouter.post("/api/auth/mfa/enable", async (ctx) => {
    const user = ctx.user as { id: string };
    const result = await authService.enableMFA(user.id);
    return ok(result);
  });

  protectedRouter.post("/api/auth/mfa/verify", async (ctx) => {
    const user = ctx.user as { id: string };
    const body = await parseBody(ctx.request);
    const valid = await authService.verifyMFA(user.id, body.code as string);
    return ok({ valid });
  });

  protectedRouter.post("/api/auth/mfa/disable", async (ctx) => {
    const user = ctx.user as { id: string };
    const body = await parseBody(ctx.request);
    await authService.disableMFA(user.id, body.code as string);
    return ok(null);
  });

  router.merge(protectedRouter);

  return router;
}
