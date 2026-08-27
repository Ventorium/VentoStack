/**
 * AI 链路追踪路由 — 会话列表 / 消息时间线 / 追踪详情 / 开关配置
 *
 * 所有查询强制 tenant_id 隔离（tenantId 取自已验证的 JWT 用户，不信任查询参数）。
 */
import { createRouter, fail, handleError, pageOf, paginated, parseBody, success } from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import { routeDoc, paginationQuery } from "./schema";
import type { TraceConfigService } from "../services/trace-config";
import type { TraceStore } from "../services/trace-store";

/** ISO 8601 时间串校验（空串/非法串拒绝，避免透传进 SQL 时间比较） */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function createTraceRoutes(
  store: TraceStore,
  config: TraceConfigService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 会话级列表：每个 conversation 聚合一行（trace 数 / 总 token / 最近时间）
  router.get(
    "/api/ai/trace/conversations",
    routeDoc("获取追踪会话列表", {
      query: {
        ...paginationQuery,
        agentId: { type: "string", description: "按 Agent ID 过滤" },
        userId: { type: "string", description: "按用户 ID 过滤" },
        keyword: { type: "string", description: "用户消息/会话 ID 模糊搜索" },
        startTime: { type: "string", description: "起始时间（ISO 8601）" },
        endTime: { type: "string", description: "结束时间（ISO 8601）" },
      },
    }),
    async (ctx) => {
      try {
        const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
        const q = ctx.query as Record<string, unknown>;
        const tenantId = (ctx.user as { tenantId?: string } | undefined)?.tenantId ?? "default";
        if (q.startTime !== undefined && !isIsoDate(q.startTime)) return fail("startTime 无效的时间格式（需 ISO 8601）", 400, 400);
        if (q.endTime !== undefined && !isIsoDate(q.endTime)) return fail("endTime 无效的时间格式（需 ISO 8601）", 400, 400);
        const result = await store.listConversations({
          tenantId,
          page,
          pageSize,
          ...(typeof q.agentId === "string" && q.agentId ? { agentId: q.agentId } : {}),
          ...(typeof q.userId === "string" && q.userId ? { userId: q.userId } : {}),
          ...(typeof q.keyword === "string" && q.keyword ? { keyword: q.keyword } : {}),
          ...(typeof q.startTime === "string" && q.startTime ? { startTime: q.startTime } : {}),
          ...(typeof q.endTime === "string" && q.endTime ? { endTime: q.endTime } : {}),
        });
        return paginated(result.items, result.total, result.page, result.pageSize);
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:trace", "list"),
  );

  // 会话消息时间线：每条 trace = 用户消息 + 助手回复（含指标）
  router.get(
    "/api/ai/trace/conversations/:id",
    routeDoc("获取会话消息时间线", {
      query: {
        limit: { type: "int", default: 100, description: "最大消息数" },
      },
    }),
    async (ctx) => {
      try {
        const id = (ctx.params as Record<string, string>).id!;
        const tenantId = (ctx.user as { tenantId?: string } | undefined)?.tenantId ?? "default";
        const rawLimit = Number((ctx.query as Record<string, unknown>)?.limit ?? 100);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, Math.floor(rawLimit)), 200) : 100;
        const messages = await store.listConversationMessages(id, tenantId, limit);
        return success(messages);
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:trace", "list"),
  );

  // 追踪详情：trace + 全部 spans（按 seq 排序，含完整 input/output）
  router.get(
    "/api/ai/trace/traces/:traceId",
    routeDoc("获取链路追踪详情"),
    async (ctx) => {
      try {
        const traceId = (ctx.params as Record<string, string>).traceId!;
        const tenantId = (ctx.user as { tenantId?: string } | undefined)?.tenantId ?? "default";
        const detail = await store.getTraceDetail(traceId, tenantId);
        if (!detail) return fail("追踪记录不存在", 404, 404);
        return success(detail);
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:trace", "list"),
  );

  // 开关查询
  router.get(
    "/api/ai/trace/config",
    routeDoc("获取链路追踪开关状态"),
    async (ctx) => {
      try {
        const enabled = await config.isEnabled();
        return success({ enabled });
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:trace", "list"),
  );

  // 开关设置
  router.put(
    "/api/ai/trace/config",
    routeDoc("设置链路追踪开关", {
      body: {
        enabled: { type: "boolean", required: true, description: "是否开启链路追踪" },
      },
    }),
    async (ctx) => {
      try {
        const body = await parseBody(ctx.request);
        if (typeof body.enabled !== "boolean") {
          return fail("enabled 字段必须为 boolean", 400, 400);
        }
        await config.setEnabled(body.enabled);
        return success({ enabled: body.enabled });
      } catch (e) {
        return handleError(e);
      }
    },
    perm("ai:trace", "config"),
  );

  return router;
}
