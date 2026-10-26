/**
 * 后台任务路由
 *
 * 归属：任务按 (tenant_id, user_id) 双栅栏读取/操作；跨租户或跨用户一律 404，
 * 不区分「不存在」与「无权访问」（避免泄露任务是否存在）。
 * 创建入口只在 Agent 工具里（需人工审批），HTTP 只提供查看与运维操作。
 */
import { createRouter, fail, handleError, pageOf, paginated, success } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type {
  BackgroundTask,
  BackgroundTaskService,
  BackgroundTaskStatus,
} from '../services/background-task';
import { paginationQuery, routeDoc } from './schema';

const VALID_STATUS: BackgroundTaskStatus[] = [
  'pending',
  'waiting',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
];

export interface BackgroundTaskRoutesDeps {
  tasks: BackgroundTaskService;
  /** 读取脚本日志尾部（VM）；未配置时日志接口返回 404 */
  readTaskLog?: (task: BackgroundTask) => Promise<string | null>;
}

export function createBackgroundTaskRoutes(
  deps: BackgroundTaskRoutesDeps,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);
  const { tasks } = deps;

  function scopeOf(ctx: { user?: unknown }): { tenantId: string; userId: string } {
    const user = ctx.user as { id?: string; tenantId?: string } | undefined;
    return { tenantId: user?.tenantId ?? 'default', userId: user?.id ?? '' };
  }

  router.get(
    '/api/ai/background-tasks',
    routeDoc('获取后台任务列表', {
      query: {
        ...paginationQuery,
        sessionId: { type: 'string', description: '按会话过滤' },
        agentId: { type: 'string', description: '按 Agent 过滤' },
        status: { type: 'string', description: '按状态过滤' },
        keyword: { type: 'string', description: '按标题模糊搜索' },
      },
      responses: {
        200: {
          list: { type: 'array', items: { type: 'object' }, description: '任务列表' },
          total: { type: 'int', description: '总数' },
        },
      },
    }),
    async (ctx) => {
      try {
        const q = ctx.query as Record<string, unknown>;
        const { page, pageSize } = pageOf(q);
        const status = typeof q.status === 'string' && q.status ? q.status : undefined;
        if (status && !VALID_STATUS.includes(status as BackgroundTaskStatus)) {
          return fail('status 取值非法', 400, 400);
        }
        const result = await tasks.list(scopeOf(ctx), {
          ...(typeof q.sessionId === 'string' && q.sessionId ? { sessionId: q.sessionId } : {}),
          ...(typeof q.agentId === 'string' && q.agentId ? { agentId: q.agentId } : {}),
          ...(status ? { status: status as BackgroundTaskStatus } : {}),
          ...(typeof q.keyword === 'string' && q.keyword ? { keyword: q.keyword } : {}),
          page,
          pageSize,
        });
        return paginated(result.list, result.total, page, pageSize);
      } catch (error) {
        return handleError(error);
      }
    },
    perm('ai:background-task', 'list'),
  );

  router.get(
    '/api/ai/background-tasks/:id',
    routeDoc('获取后台任务详情'),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const task = await tasks.getById(id, scopeOf(ctx));
      if (!task) return fail('任务不存在', 404, 404);
      return success(task);
    },
    perm('ai:background-task', 'query'),
  );

  router.get(
    '/api/ai/background-tasks/:id/runs',
    routeDoc('获取后台任务运行记录', {
      query: { limit: { type: 'int', default: 20, description: '返回条数上限' } },
    }),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const scope = scopeOf(ctx);
      const task = await tasks.getById(id, scope);
      if (!task) return fail('任务不存在', 404, 404);
      const limit = Number((ctx.query as Record<string, unknown>).limit ?? 20);
      return success(await tasks.getRuns(id, scope, Number.isFinite(limit) ? limit : 20));
    },
    perm('ai:background-task', 'query'),
  );

  router.get(
    '/api/ai/background-tasks/:id/log',
    routeDoc('读取后台脚本日志尾部'),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const task = await tasks.getById(id, scopeOf(ctx));
      if (!task) return fail('任务不存在', 404, 404);
      if (!deps.readTaskLog) return fail('当前环境不支持读取任务日志', 404, 404);
      const log = await deps.readTaskLog(task).catch(() => null);
      if (log === null) return fail('日志不可用（任务未在虚拟机中执行或执行环境已回收）', 404, 404);
      return success({ log });
    },
    perm('ai:background-task', 'query'),
  );

  router.post(
    '/api/ai/background-tasks/:id/cancel',
    routeDoc('取消后台任务'),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const task = await tasks.cancel(id, scopeOf(ctx));
      if (!task) return fail('任务不存在或已结束', 404, 404);
      return success(task);
    },
    perm('ai:background-task', 'update'),
  );

  router.post(
    '/api/ai/background-tasks/:id/pause',
    routeDoc('暂停后台定时任务'),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const task = await tasks.pause(id, scopeOf(ctx));
      if (!task) return fail('仅等待中/待启动的任务可暂停', 404, 404);
      return success(task);
    },
    perm('ai:background-task', 'update'),
  );

  router.post(
    '/api/ai/background-tasks/:id/resume',
    routeDoc('恢复已暂停的后台任务'),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const task = await tasks.resume(id, scopeOf(ctx));
      if (!task) return fail('任务不存在或未处于暂停状态', 404, 404);
      return success(task);
    },
    perm('ai:background-task', 'update'),
  );

  router.post(
    '/api/ai/background-tasks/:id/run',
    routeDoc('立即执行后台任务（重新入队）'),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const task = await tasks.enqueueNow(id, scopeOf(ctx));
      if (!task) return fail('任务不存在或正在执行/已取消', 404, 404);
      return success(task);
    },
    perm('ai:background-task', 'update'),
  );

  router.delete(
    '/api/ai/background-tasks/:id',
    routeDoc('删除后台任务及其运行记录'),
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const scope = scopeOf(ctx);
      const task = await tasks.getById(id, scope);
      if (!task) return fail('任务不存在', 404, 404);
      if (task.status === 'running') return fail('任务正在执行，请先取消', 409, 409);
      const removed = await tasks.remove(id, scope);
      if (!removed) return fail('任务删除失败', 404, 404);
      return success(null);
    },
    perm('ai:background-task', 'delete'),
  );

  return router;
}
