/**
 * 上下文洞察路由 — 概览 / 会话列表 / 会话详情
 *
 * 可见性：上下文内容（系统提示、工具 schema、逐条消息预览）属**调试信息**，
 * 仅超级管理员可访问。这里刻意不用 `createPermMiddleware`：
 * 那个中间件对 admin 角色是**放行**语义（超管拥有全部权限），用于「有权限即可访问」，
 * 而这里要的是「只有 admin 才能访问」，方向相反，必须单独判角色。
 *
 * 租户来自已验证的 JWT 用户，不接受查询参数传入（CLAUDE.md §16）。
 * 无法解析租户时 fail-closed（401/403），不退化为默认租户。
 */

import {
  createRouter,
  fail,
  handleError,
  pageOf,
  paginated,
  success,
  VentoStackError,
} from "@ventostack/core";
import type { Middleware, Router } from "@ventostack/core";
import {
  contextDetailSchema,
  contextOverviewSchema,
  contextSessionSchema,
  overviewQuery,
  routeDoc,
  sessionListQuery,
} from "./schema";
import type { ContextQueries, SessionListParams } from "../services/context-queries";
import type { ContextDetail } from "../shared/types";

/** ISO 8601 时间串校验（空串/非法串拒绝，避免透传进 SQL 时间比较） */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  return !Number.isNaN(new Date(value).getTime());
}

interface AuthUser {
  id: string;
  tenantId?: string;
  roles?: string[];
}

/** 超级管理员角色代码，与 auth 的 SUPER_ADMIN_ROLE 保持一致 */
const ADMIN_ROLE = "admin";

/** 会话无上下文记录时返回的空详情：形状与正常详情一致，仅数据为空 */
function emptyDetail(tenantId: string, sessionId: string): ContextDetail {
  return {
    session: {
      id: "",
      tenantId,
      sessionId,
      title: null,
      agentId: null,
      agentName: null,
      userId: null,
      userName: null,
      parentRunId: null,
      runCount: 0,
      model: null,
      provider: null,
      contextWindow: null,
      status: "success",
      counts: {
        turns: 0,
        steps: 0,
        injects: 0,
        compactions: 0,
        prunes: 0,
        skills: 0,
        humanInputs: 0,
        answers: 0,
      },
      current: { system: 0, tools: 0, user: 0, inject: 0, skill: 0, assistant: 0, tool: 0, total: 0 },
      usage: { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
      durationMs: 0,
      lastUser: null,
      startedAt: "",
      endedAt: null,
    },
    requests: [],
    events: [],
    nodes: [],
    droppedNodes: 0,
    archive: [],
    archiveFloor: null,
    fileOps: [],
    rev: 0,
  };
}

/**
 * 管理员专属门禁 + 租户解析，合并成一个中间件。
 *
 * 顺序固定：先判登录（401），再判租户归属（403），最后判管理员角色（403）。
 * 任何一步不满足都直接返回，不进入 handler。
 */
function requireAdmin(ctx: { user?: unknown }): { tenantId: string; userId: string } {
  const user = ctx.user as AuthUser | undefined;
  if (!user || !user.id) throw new VentoStackError("未认证", 401, "UNAUTHENTICATED");
  if (!user.tenantId || user.tenantId.trim() === "") {
    throw new VentoStackError("缺少租户归属", 403, "TENANT_REQUIRED");
  }
  if (!Array.isArray(user.roles) || !user.roles.includes(ADMIN_ROLE)) {
    // 明确返回 403：普通账号不应接触上下文调试信息
    throw new VentoStackError("仅管理员可查看上下文洞察", 403, "ADMIN_ONLY");
  }
  return { tenantId: user.tenantId, userId: user.id };
}

/** 只在 query 里显式给出非空 userId 时才生效，避免把空串当成筛选条件 */
function userIdOf(query: Record<string, unknown>): string | undefined {
  const value = query.userId;
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** 管理员专属中间件；异常统一转成标准错误响应 */
function adminOnly(): Middleware {
  return async (ctx, next) => {
    try {
      requireAdmin(ctx);
      return await next();
    } catch (e) {
      return handleError(e);
    }
  };
}

export function createContextRoutes(
  queries: ContextQueries,
  authMiddleware: Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);
  const admin = adminOnly();

  // 概览：KPI + 构成 + 每日账目（租户内跨会话聚合，可按用户收窄）
  router.get(
    "/api/ai/context/overview",
    routeDoc("获取上下文概览（KPI / 构成 / 每日账目）", {
      query: overviewQuery,
      responses: { 200: contextOverviewSchema },
    }),
    async (ctx) => {
      try {
        const { tenantId } = requireAdmin(ctx);
        const q = ctx.query as Record<string, unknown>;
        const rawDays = Number(q.days ?? 7);
        const days = Number.isFinite(rawDays)
          ? Math.min(Math.max(1, Math.floor(rawDays)), 365)
          : 7;
        const userId = userIdOf(q);
        const overview = await queries.getOverview(tenantId, days, userId ? { userId } : undefined);
        return success(overview);
      } catch (e) {
        return handleError(e);
      }
    },
    admin,
  );

  // 会话列表（分页 + 筛选 + 排序）
  router.get(
    "/api/ai/context/sessions",
    routeDoc("获取上下文会话列表（分页 + 筛选 + 排序）", {
      query: sessionListQuery,
      responses: { 200: contextSessionSchema },
    }),
    async (ctx) => {
      try {
        const { tenantId } = requireAdmin(ctx);
        const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
        const q = ctx.query as Record<string, unknown>;
        if (q.startTime !== undefined && !isIsoDate(q.startTime)) {
          return fail("startTime 无效的时间格式（需 ISO 8601）", 400, 400);
        }
        if (q.endTime !== undefined && !isIsoDate(q.endTime)) {
          return fail("endTime 无效的时间格式（需 ISO 8601）", 400, 400);
        }
        const sort =
          q.sort === "tokens" || q.sort === "context" || q.sort === "recent" ? q.sort : "recent";
        const userId = userIdOf(q);
        const params: SessionListParams = {
          tenantId,
          page,
          pageSize,
          sort,
          ...(typeof q.keyword === "string" && q.keyword ? { keyword: q.keyword } : {}),
          ...(typeof q.agentId === "string" && q.agentId ? { agentId: q.agentId } : {}),
          ...(userId ? { userId } : {}),
          ...(typeof q.startTime === "string" && q.startTime ? { startTime: q.startTime } : {}),
          ...(typeof q.endTime === "string" && q.endTime ? { endTime: q.endTime } : {}),
        };
        const result = await queries.listSessions(params);
        return paginated(result.items, result.total, result.page, result.pageSize);
      } catch (e) {
        return handleError(e);
      }
    },
    admin,
  );

  // 会话详情：请求快照 + 事件 + 活跃面 + 归档 + 文件操作（上下文浏览器数据源）
  router.get(
    "/api/ai/context/sessions/:sessionId",
    routeDoc("获取会话上下文详情（快照序列 / 事件 / 活跃面 / 归档 / 文件操作）", {
      responses: { 200: contextDetailSchema },
    }),
    async (ctx) => {
      try {
        const { tenantId } = requireAdmin(ctx);
        const sessionId = (ctx.params as Record<string, string>).sessionId!;
        const detail = await queries.getDetail(tenantId, sessionId);
        // 无上下文记录（会话尚未产生模型请求，或采集已过期）返回空详情而非 404：
        // 前端据此渲染空态。统一 200 也消除了「探测会话是否存在」的侧信道——
        // 无论会话是否真实存在、是否跨租户，响应形状都一致，不泄露资源存在性。
        if (!detail) return success(emptyDetail(tenantId, sessionId));
        return success(detail);
      } catch (e) {
        return handleError(e);
      }
    },
    admin,
  );

  return router;
}
