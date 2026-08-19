/**
 * AI 审计日志路由 — 查询 ai_tool_log 表
 */
import { createRouter, pageOf, paginated } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import { routeDoc } from './schema';

export function createAuditRoutes(
  db: { raw: (sql: string, params?: unknown[]) => Promise<unknown[]> },
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  router.get(
    '/api/ai/audit',
    routeDoc('获取 AI 工具审计日志', {
      query: {
        page: { type: 'int', default: 1, description: '页码' },
        pageSize: { type: 'int', default: 20, description: '每页数量' },
        toolName: { type: 'string', description: '工具名模糊搜索' },
        status: { type: 'string', description: '状态过滤（success/error）' },
        userId: { type: 'string', description: '用户 ID 过滤' },
      },
    }),
    async (ctx) => {
      const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
      const q = ctx.query as Record<string, unknown>;
      const tenantId = (ctx.user as { tenantId?: string })?.tenantId ?? 'default';

      const conditions: string[] = ['tenant_id = $1'];
      const params: unknown[] = [tenantId];
      let idx = 2;

      if (q.toolName) {
        conditions.push(`tool_name LIKE $${idx++}`);
        params.push(`%${q.toolName}%`);
      }
      if (q.status) {
        conditions.push(`status = $${idx++}`);
        params.push(q.status);
      }
      if (q.userId) {
        conditions.push(`user_id = $${idx++}`);
        params.push(q.userId);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const offset = (page - 1) * pageSize;

      const countRows = await db.raw(`SELECT COUNT(*) as cnt FROM ai_tool_log ${where}`, params);
      const total = Number((countRows as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

      const rows = await db.raw(
        `SELECT id, tool_name as "toolName", user_id as "userId",
                status, duration,
                CASE WHEN input IS NULL THEN NULL ELSE LEFT(input::text, 500) END as input,
                CASE WHEN output IS NULL THEN NULL ELSE LEFT(output::text, 500) END as output,
                created_at as "createdAt"
         FROM ai_tool_log ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, pageSize, offset],
      );

      return paginated(rows as unknown[], total, page, pageSize);
    },
    perm('ai:audit', 'list'),
  );

  return router;
}
