/**
 * @ventostack/notify - 通知路由
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { NotificationService } from "../services/notification";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

export function createNotificationRoutes(
  notificationService: NotificationService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 发送通知
  router.post("/api/notification/send", perm("notification", "message:send"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await notificationService.send({
        templateId: body.templateId as string | undefined,
        receiverId: body.receiverId as string,
        channel: body.channel as string,
        title: body.title as string | undefined,
        content: body.content as string,
        variables: body.variables as Record<string, unknown> | undefined,
      });
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "发送失败", 400);
    }
  });

  // 消息列表
  router.get("/api/notification/messages", perm("notification", "message:list"), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const result = await notificationService.listMessages({
      receiverId: q.receiverId as string | undefined,
      channel: q.channel as string | undefined,
      status: q.status !== undefined ? Number(q.status) : undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  // 未读数
  router.get("/api/notification/messages/unread-count", perm("notification", "message:query"), async (ctx) => {
    const user = ctx.user as { id: string };
    const count = await notificationService.getUnreadCount(user.id);
    return ok({ count });
  });

  // 标记已读
  router.put("/api/notification/messages/:id/read", perm("notification", "message:update"), async (ctx) => {
    const user = ctx.user as { id: string };
    const id = (ctx.params as Record<string, string>).id!;
    await notificationService.markRead(user.id, id);
    return ok(null);
  });

  // 批量标记已读
  router.post("/api/notification/messages/read-batch", perm("notification", "message:update"), async (ctx) => {
    const user = ctx.user as { id: string };
    const body = await parseBody(ctx.request);
    const messageIds = body.messageIds as string[];
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return fail("请提供消息 ID", 400);
    }
    await notificationService.markBatchRead(user.id, messageIds);
    return ok(null);
  });

  // 重试发送
  router.post("/api/notification/messages/:id/retry", perm("notification", "message:send"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    try {
      await notificationService.retry(id);
      return ok(null);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "重试失败", 400);
    }
  });

  // === Template CRUD ===

  // 创建模板
  router.post("/api/notification/templates", perm("notification", "template:create"), async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await notificationService.createTemplate({
        name: body.name as string,
        code: body.code as string,
        channel: body.channel as string,
        title: body.title as string | undefined,
        content: body.content as string,
      });
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "创建失败", 400);
    }
  });

  // 模板列表
  router.get("/api/notification/templates", perm("notification", "template:list"), async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, unknown>;
    const result = await notificationService.listTemplates({
      channel: q.channel as string | undefined,
      page,
      pageSize,
    });
    return okPage(result.items, result.total, result.page, result.pageSize);
  });

  // 更新模板
  router.put("/api/notification/templates/:id", perm("notification", "template:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await notificationService.updateTemplate(id, body);
    return ok(null);
  });

  // 删除模板
  router.delete("/api/notification/templates/:id", perm("notification", "template:delete"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await notificationService.deleteTemplate(id);
    return ok(null);
  });

  return router;
}
