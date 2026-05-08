/**
 * @ventostack/system - 认证路由
 *
 * 公开端点（login/register/forgot-password/reset-password）直接在 router 上注册。
 * 需认证端点（logout/MFA）在子 router 上通过 use(authMiddleware) 保护。
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router, RouteSchemaConfig } from "@ventostack/core";
import type { AuthService } from "../services/auth";
import { ok, fail, parseBody } from "./common";

const tokenPairSchema = {
  accessToken: { type: "string" as const, description: "访问令牌" },
  refreshToken: { type: "string" as const, description: "刷新令牌" },
  expiresIn: { type: "int" as const, description: "过期时间（秒）" },
  tokenType: { type: "string" as const, description: "令牌类型" },
};

export function createAuthRoutes(
  authService: AuthService,
  authMiddleware: Middleware,
): Router {
  const router = createRouter();

  // ---- 公开端点 ----
  router.post("/api/auth/login", {
    body: {
      username: { type: "string" as const, required: true, description: "用户名" },
      password: { type: "string" as const, required: true, description: "密码" },
      deviceType: { type: "string" as const, description: "设备类型" },
    },
    responses: {
      200: {
        accessToken: { type: "string" as const, description: "访问令牌" },
        refreshToken: { type: "string" as const, description: "刷新令牌" },
        expiresIn: { type: "int" as const, description: "过期时间（秒）" },
        tokenType: { type: "string" as const, description: "令牌类型" },
      },
    },
    openapi: { summary: "用户登录", tags: ["auth"], operationId: "login" },
  }, async (ctx) => {
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
    } catch (e: unknown) {
      const err = e as Error & { code?: string; data?: { tempToken?: string } };
      if (err.code === "password_expired" && err.data?.tempToken) {
        return fail("密码已过期", 403, 403, { code: "password_expired", tempToken: err.data.tempToken });
      }
      const msg = e instanceof Error ? e.message : "登录失败";
      return fail(msg, 401, 401);
    }
  });

  router.post("/api/auth/register", {
    body: {
      username: { type: "string" as const, required: true, min: 3, max: 50, description: "用户名" },
      password: { type: "string" as const, required: true, min: 6, description: "密码" },
      email: { type: "string" as const, format: "email", description: "邮箱" },
      phone: { type: "string" as const, description: "手机号" },
    },
    responses: { 200: tokenPairSchema },
    openapi: { summary: "用户注册", tags: ["auth"], operationId: "register" },
  }, async (ctx) => {
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
      const msg = e instanceof Error ? e.message : "注册失败";
      return fail(msg, 400);
    }
  });

  router.post("/api/auth/forgot-password", {
    body: {
      email: { type: "string" as const, required: true, format: "email", description: "注册邮箱" },
    },
    responses: { 200: { resetToken: { type: "string" as const, description: "密码重置令牌" } } },
    openapi: { summary: "忘记密码", tags: ["auth"], operationId: "forgotPassword" },
  }, async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const email = body.email as string;
      if (!email) return fail("请输入邮箱", 400);
      const result = await authService.forgotPassword(email);
      return ok({ resetToken: result.resetToken });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "找回密码失败";
      return fail(msg, 400);
    }
  });

  router.post("/api/auth/reset-password", {
    body: {
      userId: { type: "uuid" as const, required: true, description: "用户 ID" },
      newPassword: { type: "string" as const, required: true, min: 6, description: "新密码" },
    },
    openapi: { summary: "重置密码（管理员）", tags: ["auth"], operationId: "resetPassword" },
  }, async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      await authService.resetPassword(body.userId as string, body.newPassword as string);
      return ok(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "重置失败";
      return fail(msg, 400);
    }
  });

  router.post("/api/auth/reset-password-by-token", {
    body: {
      token: { type: "string" as const, required: true, description: "重置令牌" },
      newPassword: { type: "string" as const, required: true, min: 6, description: "新密码" },
    },
    openapi: { summary: "通过令牌重置密码", tags: ["auth"], operationId: "resetPasswordByToken" },
  }, async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      await authService.resetPasswordByToken(body.token as string, body.newPassword as string);
      return ok(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "重置失败";
      return fail(msg, 400);
    }
  });

  router.post("/api/auth/refresh", {
    body: {
      refreshToken: { type: "string" as const, required: true, description: "刷新令牌" },
    },
    responses: { 200: tokenPairSchema },
    openapi: { summary: "刷新令牌", tags: ["auth"], operationId: "refreshToken" },
  }, async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await authService.refreshToken(body.refreshToken as string);
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "刷新令牌失败";
      return fail(msg, 401, 401);
    }
  });

  router.post("/api/auth/mfa/login", {
    body: {
      mfaToken: { type: "string" as const, required: true, description: "MFA 临时令牌" },
      code: { type: "string" as const, required: true, description: "TOTP 验证码" },
      deviceType: { type: "string" as const, description: "设备类型" },
    },
    responses: { 200: tokenPairSchema },
    openapi: { summary: "MFA 登录验证", tags: ["auth"], operationId: "mfaLogin" },
  }, async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await authService.completeMFALogin(
        body.mfaToken as string,
        body.code as string,
        ctx.request.headers.get("x-forwarded-for") ?? "unknown",
        ctx.request.headers.get("user-agent") ?? "unknown",
        body.deviceType as string | undefined,
      );
      return ok(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "MFA 验证失败";
      return fail(msg, 401, 401);
    }
  });

  // ---- 需认证端点 ----
  const protectedRouter = createRouter();
  protectedRouter.use(authMiddleware);

  protectedRouter.post("/api/auth/logout", {
    openapi: { summary: "退出登录", tags: ["auth"], operationId: "logout" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (user) {
      await authService.logout(user.id, "");
    }
    return ok(null);
  });

  // MFA
  protectedRouter.post("/api/auth/mfa/enable", {
    responses: {
      200: {
        secret: { type: "string" as const, description: "TOTP 密钥" },
        qrCode: { type: "string" as const, description: "二维码数据 URL" },
        backupCodes: { type: "array" as const, description: "备用恢复码" },
      },
    },
    openapi: { summary: "启用 MFA", tags: ["auth"], operationId: "enableMFA" },
  }, async (ctx) => {
    const user = ctx.user as { id: string };
    const result = await authService.enableMFA(user.id);
    return ok(result);
  });

  protectedRouter.post("/api/auth/mfa/verify", {
    body: {
      code: { type: "string" as const, required: true, description: "TOTP 验证码" },
    },
    responses: { 200: { valid: { type: "boolean" as const, description: "验证结果" } } },
    openapi: { summary: "验证 MFA 码", tags: ["auth"], operationId: "verifyMFA" },
  }, async (ctx) => {
    const user = ctx.user as { id: string };
    const body = await parseBody(ctx.request);
    const valid = await authService.verifyMFA(user.id, body.code as string);
    return ok({ valid });
  });

  protectedRouter.post("/api/auth/mfa/disable", {
    body: {
      code: { type: "string" as const, required: true, description: "TOTP 验证码" },
    },
    openapi: { summary: "禁用 MFA", tags: ["auth"], operationId: "disableMFA" },
  }, async (ctx) => {
    const user = ctx.user as { id: string };
    const body = await parseBody(ctx.request);
    await authService.disableMFA(user.id, body.code as string);
    return ok(null);
  });

  router.merge(protectedRouter);

  return router;
}
