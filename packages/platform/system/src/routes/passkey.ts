/**
 * @ventostack/system - Passkey 路由
 *
 * 公开端点：login-begin, login-finish
 * 受保护端点：register-begin, register-finish, list, delete
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { Cache } from "@ventostack/cache";
import type { PasskeyService } from "../services/passkey";
import type { AuthService } from "../services/auth";
import { ok, fail, parseBody } from "./common";

/** IP 每分钟最大请求次数 */
const MAX_IP_REQUESTS_PER_MINUTE = 20;
/** IP 限流窗口（秒） */
const IP_RATE_WINDOW = 60;

/** 从请求中提取客户端 IP */
function getClientIP(request: Request): string {
  // 优先使用 X-Forwarded-For（需在反向代理后使用）
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // 取第一个（最外层代理添加的客户端 IP）
    return forwarded.split(",")[0]!.trim();
  }
  return "unknown";
}

export function createPasskeyRoutes(
  passkeyService: PasskeyService,
  authService: AuthService,
  authMiddleware: Middleware,
  cache: Cache,
): Router {
  const router = createRouter();

  // ---- 公开端点 ----
  router.post("/api/auth/passkey/login-begin", async (ctx) => {
    try {
      // IP 速率限制
      const ip = getClientIP(ctx.request);
      const ipKey = `passkey_ip:${ip}`;
      const ipCount = await cache.get<number>(ipKey);
      if (ipCount !== null && ipCount >= MAX_IP_REQUESTS_PER_MINUTE) {
        return fail("请求过于频繁，请稍后再试", 429);
      }
      await cache.set(ipKey, (ipCount ?? 0) + 1, { ttl: IP_RATE_WINDOW });

      const body = await parseBody(ctx.request);
      const result = await passkeyService.beginAuthentication(body.username as string);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to begin passkey login";
      return fail(msg, 400);
    }
  });

  router.post("/api/auth/passkey/login-finish", async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const { userId, username } = await passkeyService.finishAuthentication(
        body.challengeId as string,
        body.assertion as any,
      );

      const ip = getClientIP(ctx.request);

      const loginResult = await authService.completePasskeyLogin({
        userId,
        username,
        ip,
        userAgent: ctx.request.headers.get("user-agent") ?? "unknown",
        ...(body.deviceType ? { deviceType: body.deviceType as string } : {}),
      });

      return ok(loginResult);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Passkey verification failed";
      return fail(msg, 401, 401);
    }
  });

  // ---- 受保护端点 ----
  const protectedRouter = createRouter();
  protectedRouter.use(authMiddleware);

  protectedRouter.post("/api/auth/passkey/register-begin", async (ctx) => {
    try {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail("Not authenticated", 401, 401);
      const result = await passkeyService.beginRegistration(user.id);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to begin registration";
      return fail(msg, 400);
    }
  });

  protectedRouter.post("/api/auth/passkey/register-finish", async (ctx) => {
    try {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail("Not authenticated", 401, 401);
      const body = await parseBody(ctx.request);
      const result = await passkeyService.finishRegistration(
        user.id,
        body.name as string,
        body.challengeId as string,
        body.credential as any,
      );
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to finish registration";
      return fail(msg, 400);
    }
  });

  protectedRouter.get("/api/auth/passkey/list", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);
    const passkeys = await passkeyService.listPasskeys(user.id);
    return ok(passkeys);
  });

  protectedRouter.delete("/api/auth/passkey/:id", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);
    const passkeyId = (ctx.params as Record<string, string>).id!;
    await passkeyService.removePasskey(user.id, passkeyId);
    return ok(null);
  });

  router.merge(protectedRouter);
  return router;
}
