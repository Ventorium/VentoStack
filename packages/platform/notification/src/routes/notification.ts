/**
 * @ventostack/notify - 通知路由
 */

import { createRouter, fail, pageOf, paginated, parseBody, safeErrorMessage, success } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import type { NotificationService } from "../services/notification";

export function createNotificationRoutes(
  notificationService: NotificationService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 发送通知
  router.post(
    "/api/system/notification/send",
    perm("notification:message", "send"),
    async (ctx) => {
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
        return success(result);
      } catch (e) {
        return fail(safeErrorMessage(e, "发送失败"), 400);
      }
    },
  );

  // 按岗位批量投递
  router.post(
    "/api/system/notification/send-by-posts",
    perm("notification:message", "send"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const result = await notificationService.sendByPosts({
          postIds: (body.postIds as string[]) ?? [],
          templateId: body.templateId as string | undefined,
          channel: body.channel as string,
          title: body.title as string | undefined,
          content: body.content as string,
          variables: body.variables as Record<string, unknown> | undefined,
        });
        return success(result);
      } catch (e) {
        return fail(safeErrorMessage(e, "发送失败"), 400);
      }
    },
  );

  // 消息列表
  router.get(
    "/api/system/notification/messages",
    perm("notification:message", "list"),
    async (ctx) => {
      const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
      const q = ctx.query as Record<string, unknown>;
      // 强制按当前登录用户过滤，忽略客户端传参，防止水平越权查看他人消息
      const user = ctx.user as { id: string };
      const result = await notificationService.listMessages({
        receiverId: user.id,
        channel: q.channel as string | undefined,
        status: q.status !== undefined ? Number(q.status) : undefined,
        read: typeof q.read === 'string' ? q.read : undefined,
        page,
        pageSize,
      });
      return paginated(result.items, result.total, result.page, result.pageSize);
    },
  );

  // 未读数
  router.get(
    "/api/system/notification/messages/unread-count",
    perm("notification:message", "query"),
    async (ctx) => {
      const user = ctx.user as { id: string };
      const count = await notificationService.getUnreadCount(user.id);
      return success({ count });
    },
  );

  // 标记已读
  router.put(
    "/api/system/notification/messages/:id/read",
    perm("notification:message", "update"),
    async (ctx) => {
      const user = ctx.user as { id: string };
      const id = (ctx.params as Record<string, string>).id!;
      await notificationService.markRead(user.id, id);
      return success(null);
    },
  );

  // 批量标记已读
  router.post(
    "/api/system/notification/messages/read-batch",
    perm("notification:message", "update"),
    async (ctx) => {
      const user = ctx.user as { id: string };
      const body = await parseBody(ctx.request);
      const messageIds = body.messageIds as string[];
      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return fail("请提供消息 ID", 400);
      }
      if (messageIds.length > 100) {
        return fail("批量操作数量不能超过 100", 400);
      }
      await notificationService.markBatchRead(user.id, messageIds);
      return success(null);
    },
  );

  // 重试发送
  router.post(
    "/api/system/notification/messages/:id/retry",
    perm("notification:message", "send"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      try {
        await notificationService.retry(id);
        return success(null);
      } catch (e) {
        return fail(safeErrorMessage(e, "重试失败"), 400);
      }
    },
  );

  // 删除消息（仅接收者本人）
  router.delete(
    "/api/system/notification/messages/:id",
    perm("notification:message", "delete"),
    async (ctx) => {
      const user = ctx.user as { id: string };
      const id = (ctx.params as Record<string, string>).id!;
      try {
        await notificationService.deleteMessage(user.id, id);
        return success(null);
      } catch (e) {
        return fail(safeErrorMessage(e, "删除失败"), 400);
      }
    },
  );

  // === Template CRUD ===

  // 创建模板
  router.post(
    "/api/system/notification/templates",
    perm("notification:template", "create"),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        const result = await notificationService.createTemplate({
          name: body.name as string,
          code: body.code as string,
          channel: body.channel as string,
          title: body.title as string | undefined,
          content: body.content as string,
        });
        return success(result);
      } catch (e) {
        return fail(safeErrorMessage(e, "创建失败"), 400);
      }
    },
  );

  // 模板列表
  router.get(
    "/api/system/notification/templates",
    perm("notification:template", "list"),
    async (ctx) => {
      const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
      const q = ctx.query as Record<string, unknown>;
      const result = await notificationService.listTemplates({
        channel: q.channel as string | undefined,
        page,
        pageSize,
      });
      return paginated(result.items, result.total, result.page, result.pageSize);
    },
  );

  // 更新模板
  router.put(
    "/api/system/notification/templates/:id",
    perm("notification:template", "update"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      await notificationService.updateTemplate(id, body);
      return success(null);
    },
  );

  // 删除模板
  router.delete(
    "/api/system/notification/templates/:id",
    perm("notification:template", "delete"),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      await notificationService.deleteTemplate(id);
      return success(null);
    },
  );

  return router;
}
