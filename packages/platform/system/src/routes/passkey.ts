/**
 * @ventostack/system - Passkey 路由
 *
 * 公开端点：login-begin, login-finish
 * 受保护端点：register-begin, register-finish, list, delete
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router, RouteSchemaConfig } from "@ventostack/core";
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

const passkeyItemSchema = {
  id: { type: "uuid" as const, description: "Passkey ID" },
  name: { type: "string" as const, description: "Passkey 名称" },
  createdAt: { type: "date" as const, description: "创建时间" },
};

export function createPasskeyRoutes(
  passkeyService: PasskeyService,
  authService: AuthService,
  authMiddleware: Middleware,
  cache: Cache,
): Router {
  const router = createRouter();

  // ---- 公开端点 ----
  router.post("/api/auth/passkey/login-begin", {
    body: {
      username: { type: "string" as const, description: "用户名（可选，用于识别用户）" },
    },
    responses: {
      200: {
        challengeId: { type: "string" as const, description: "挑战 ID" },
        challenge: { type: "string" as const, description: "WebAuthn 挑战数据" },
      },
    },
    openapi: { summary: "开始 Passkey 登录", tags: ["auth", "passkey"], operationId: "passkeyLoginBegin" },
  }, async (ctx) => {
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
      const msg = e instanceof Error ? e.message : "通行密钥登录失败";
      return fail(msg, 400);
    }
  });

  router.post("/api/auth/passkey/login-finish", {
    body: {
      challengeId: { type: "string" as const, required: true, description: "挑战 ID" },
      assertion: { type: "object" as const, required: true, description: "WebAuthn 断言数据" },
      deviceType: { type: "string" as const, description: "设备类型" },
    },
    responses: {
      200: {
        accessToken: { type: "string" as const, description: "访问令牌" },
        refreshToken: { type: "string" as const, description: "刷新令牌" },
        expiresIn: { type: "int" as const, description: "过期时间（秒）" },
      },
    },
    openapi: { summary: "完成 Passkey 登录", tags: ["auth", "passkey"], operationId: "passkeyLoginFinish" },
  }, async (ctx) => {
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
      const msg = e instanceof Error ? e.message : "通行密钥验证失败";
      return fail(msg, 401, 401);
    }
  });

  // ---- 受保护端点 ----
  const protectedRouter = createRouter();
  protectedRouter.use(authMiddleware);

  protectedRouter.post("/api/auth/passkey/register-begin", {
    responses: {
      200: {
        challengeId: { type: "string" as const, description: "挑战 ID" },
        challenge: { type: "string" as const, description: "WebAuthn 挑战数据" },
      },
    },
    openapi: { summary: "开始 Passkey 注册", tags: ["auth", "passkey"], operationId: "passkeyRegisterBegin" },
  }, async (ctx) => {
    try {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail("未登录", 401, 401);
      const result = await passkeyService.beginRegistration(user.id);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "通行密钥注册失败";
      return fail(msg, 400);
    }
  });

  protectedRouter.post("/api/auth/passkey/register-finish", {
    body: {
      name: { type: "string" as const, required: true, description: "Passkey 名称" },
      challengeId: { type: "string" as const, required: true, description: "挑战 ID" },
      credential: { type: "object" as const, required: true, description: "WebAuthn 凭证数据" },
    },
    responses: { 200: passkeyItemSchema },
    openapi: { summary: "完成 Passkey 注册", tags: ["auth", "passkey"], operationId: "passkeyRegisterFinish" },
  }, async (ctx) => {
    try {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail("未登录", 401, 401);
      const body = await parseBody(ctx.request);
      const result = await passkeyService.finishRegistration(
        user.id,
        body.name as string,
        body.challengeId as string,
        body.credential as any,
      );
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "通行密钥注册完成失败";
      return fail(msg, 400);
    }
  });

  protectedRouter.get("/api/auth/passkey/list", {
    responses: { 200: { type: "array" as const, description: "Passkey 列表" } },
    openapi: { summary: "获取 Passkey 列表", tags: ["auth", "passkey"], operationId: "listPasskeys" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("未登录", 401, 401);
    const passkeys = await passkeyService.listPasskeys(user.id);
    return ok(passkeys);
  });

  protectedRouter.delete("/api/auth/passkey/:id", {
    openapi: { summary: "删除 Passkey", tags: ["auth", "passkey"], operationId: "deletePasskey" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("未登录", 401, 401);
    const passkeyId = (ctx.params as Record<string, string>).id!;
    await passkeyService.removePasskey(user.id, passkeyId);
    return ok(null);
  });

  router.merge(protectedRouter);
  return router;
}
