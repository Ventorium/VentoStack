/**
 * @ventostack/system - 用户管理路由
 *
 * 使用 router.use(authMiddleware) 注册为组中间件，
 * 避免 get/post 等快捷方法将 authMiddleware 误识别为 handler。
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router, RouteSchemaConfig } from "@ventostack/core";
import type { UserService } from "../services/user";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

const userItemSchema = {
  id: { type: "uuid" as const, description: "用户 ID" },
  username: { type: "string" as const, description: "用户名" },
  nickname: { type: "string" as const, description: "昵称" },
  email: { type: "string" as const, format: "email", description: "邮箱" },
  phone: { type: "string" as const, description: "手机号" },
  avatar: { type: "string" as const, description: "头像 URL" },
  status: { type: "int" as const, description: "状态 0=停用 1=正常" },
  deptId: { type: "uuid" as const, description: "部门 ID" },
  createdAt: { type: "date" as const, description: "创建时间" },
};

const paginatedUserSchema = {
  list: { type: "array" as const, description: "用户列表" },
  total: { type: "int" as const, description: "总数" },
  page: { type: "int" as const, description: "当前页" },
  pageSize: { type: "int" as const, description: "每页数量" },
  totalPages: { type: "int" as const, description: "总页数" },
};

export function createUserRoutes(
  userService: UserService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  router.get("/api/system/users", {
    query: {
      page: { type: "int" as const, default: 1, description: "页码" },
      pageSize: { type: "int" as const, default: 10, description: "每页数量" },
      username: { type: "string" as const, description: "用户名筛选" },
      status: { type: "int" as const, description: "状态筛选" },
      deptId: { type: "uuid" as const, description: "部门 ID 筛选" },
    },
    responses: { 200: paginatedUserSchema },
    openapi: { summary: "获取用户列表", tags: ["user"], operationId: "listUsers" },
  }, async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const result = await userService.list({
      page,
      pageSize,
      username: (ctx.query as Record<string, unknown>).username as string | undefined,
      status: (ctx.query as Record<string, unknown>).status as number | undefined,
      deptId: (ctx.query as Record<string, unknown>).deptId as string | undefined,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  }, perm("system", "user:list"));

  router.get("/api/system/users/:id", {
    responses: { 200: userItemSchema },
    openapi: { summary: "获取用户详情", tags: ["user"], operationId: "getUser" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const user = await userService.getById(id);
    if (!user) return fail("用户不存在", 404, 404);
    return ok(user);
  }, perm("system", "user:query"));

  router.post("/api/system/users", {
    body: {
      username: { type: "string" as const, required: true, min: 3, max: 50, description: "用户名" },
      password: { type: "string" as const, required: true, min: 6, description: "密码" },
      nickname: { type: "string" as const, description: "昵称" },
      email: { type: "string" as const, format: "email", description: "邮箱" },
      phone: { type: "string" as const, description: "手机号" },
      deptId: { type: "uuid" as const, description: "部门 ID" },
      roleIds: { type: "array" as const, description: "角色 ID 列表" },
      status: { type: "int" as const, default: 1, description: "状态" },
    },
    responses: { 200: { id: { type: "uuid" as const, description: "用户 ID" } } },
    openapi: { summary: "创建用户", tags: ["user"], operationId: "createUser" },
  }, async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await userService.create(body as any);
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "创建失败", 400);
    }
  }, perm("system", "user:create"));

  router.put("/api/system/users/:id", {
    body: {
      nickname: { type: "string" as const, description: "昵称" },
      email: { type: "string" as const, format: "email", description: "邮箱" },
      phone: { type: "string" as const, description: "手机号" },
      deptId: { type: "uuid" as const, description: "部门 ID" },
      roleIds: { type: "array" as const, description: "角色 ID 列表" },
      status: { type: "int" as const, description: "状态" },
    },
    openapi: { summary: "更新用户", tags: ["user"], operationId: "updateUser" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await userService.update(id, body as any);
    return ok(null);
  }, perm("system", "user:update"));

  router.delete("/api/system/users/:id", {
    openapi: { summary: "删除用户", tags: ["user"], operationId: "deleteUser" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await userService.delete(id);
    return ok(null);
  }, perm("system", "user:delete"));

  router.put("/api/system/users/:id/reset-pwd", {
    body: {
      newPassword: { type: "string" as const, required: true, min: 6, description: "新密码" },
    },
    openapi: { summary: "重置用户密码", tags: ["user"], operationId: "resetUserPassword" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await userService.resetPassword(id, body.newPassword as string);
    return ok(null);
  }, perm("system", "user:resetPwd"));

  router.put("/api/system/users/:id/status", {
    body: {
      status: { type: "int" as const, required: true, enum: ["0", "1"], description: "状态 0=停用 1=正常" },
    },
    openapi: { summary: "修改用户状态", tags: ["user"], operationId: "updateUserStatus" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await userService.updateStatus(id, body.status as number);
    return ok(null);
  }, perm("system", "user:update"));

  router.post("/api/system/users/export", {
    body: {
      username: { type: "string" as const, description: "用户名筛选" },
      status: { type: "int" as const, description: "状态筛选" },
      deptId: { type: "uuid" as const, description: "部门 ID 筛选" },
    },
    openapi: { summary: "导出用户 CSV", tags: ["user"], operationId: "exportUsers" },
  }, async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const csv = await userService.export({
        username: body.username as string | undefined,
        status: body.status as number | undefined,
        deptId: body.deptId as string | undefined,
      });
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=users.csv",
        },
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "导出失败", 400);
    }
  });

  return router;
}
