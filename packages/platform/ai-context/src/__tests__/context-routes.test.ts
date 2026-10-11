/**
 * 上下文洞察路由的 HTTP 集成测试
 *
 * 覆盖 CLAUDE.md §16 要求的三类回归：
 *  1. 同租户成功
 *  2. 跨租户不可见（按 404 处理，不泄露资源是否存在）
 *  3. 未认证 / 缺失租户 fail-closed（401 / 403）
 *
 * 另加本模块特有的管理员门禁：上下文内容属调试信息，非 admin 角色一律 403。
 * 门禁刻意不用 createPermMiddleware —— 那个中间件对 admin 是放行语义，方向相反。
 */

import { describe, expect, test } from "bun:test";
import type { Middleware, Router } from "@ventostack/core";
import { createContextRoutes } from "../routes/context";
import type { ContextQueries, OverviewScope, SessionListParams } from "../services/context-queries";

interface QueriesStub extends ContextQueries {
  seen: SessionListParams[];
  overviewScopes: Array<OverviewScope | undefined>;
}

const EMPTY_COMPOSITION = {
  system: 0, tools: 0, user: 0, inject: 0, skill: 0, assistant: 0, tool: 0, total: 0,
};

function emptyOverview() {
  return {
    sessionCount: 0, requestCount: 0, billedTokens: 0,
    estimatedCost: null, cacheHitRate: null, days: [],
    composition: { ...EMPTY_COMPOSITION },
  };
}

function createQueriesStub(overrides?: Partial<ContextQueries>): QueriesStub {
  const seen: SessionListParams[] = [];
  const overviewScopes: Array<OverviewScope | undefined> = [];
  const base = {
    listSessions: async (p: SessionListParams) => {
      seen.push(p);
      return { items: [], total: 0, page: p.page, pageSize: p.pageSize };
    },
    getSession: async () => null,
    getDetail: async () => null,
    getOverview: async (_t: string, _d: number, scope?: OverviewScope) => {
      overviewScopes.push(scope);
      return emptyOverview();
    },
    ...overrides,
  };
  return { ...base, seen, overviewScopes } as QueriesStub;
}

/** 管理员用户 */
const adminUser = { id: "u-admin", tenantId: "t-a", roles: ["admin"] };
/** 普通用户（已认证、有租户，但不是管理员） */
const normalUser = { id: "u-normal", tenantId: "t-a", roles: ["user"] };

/** 把 ctx.user 注入为指定用户的中间件（模拟已认证） */
function withUser(user: unknown): Middleware {
  return async (ctx, next) => {
    (ctx as { user?: unknown }).user = user;
    return next();
  };
}

const DETAIL_FIXTURE = {
  session: {
    id: "x", tenantId: "t-a", sessionId: "sess-1", status: "success",
    counts: {}, current: { ...EMPTY_COMPOSITION },
    usage: { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
    durationMs: 0, startedAt: "2026-01-01",
  },
  requests: [], events: [], nodes: [], archive: [], fileOps: [],
  droppedNodes: 0, archiveFloor: null, rev: 0,
};

/** 收集路由表，跑完整中间件链后调用 handler */
async function invoke(
  router: Router,
  method: string,
  path: string,
  init: RequestInit & { user?: unknown } = {},
): Promise<Response> {
  const [pathname] = path.split("?");
  const routes = (
    router as unknown as {
      routes(): Array<{
        method: string;
        path: string;
        handler: (ctx: unknown) => Promise<Response>;
        middleware: Array<(ctx: unknown, next: () => Promise<Response>) => Promise<Response>>;
      }>;
    }
  ).routes();
  const match = routes.find((r) => r.method === method && r.path === pathname);
  if (!match) throw new Error(`未找到路由 ${method} ${pathname}`);

  const url = new URL(`http://localhost${path}`);
  const request = new Request(url, { method, ...init });
  const ctx = {
    request,
    url,
    params: Object.fromEntries([...pathname.matchAll(/:(\w+)/g)].map((m) => [m[1], "sess-1"])),
    query: Object.fromEntries(url.searchParams),
    user: init.user,
  };
  const chain = match.middleware;
  const dispatch = async (i: number): Promise<Response> => {
    if (i >= chain.length) return match.handler(ctx);
    return chain[i]!(ctx, () => dispatch(i + 1));
  };
  return dispatch(0);
}

describe("上下文洞察路由", () => {
  describe("1. 管理员同租户成功", () => {
    test("概览返回 200 且携带当前租户", async () => {
      const seen: string[] = [];
      const queries = createQueriesStub({
        getOverview: async (tenantId: string) => {
          seen.push(tenantId);
          return { ...emptyOverview(), sessionCount: 3 };
        },
      });
      const router = createContextRoutes(queries, withUser(adminUser));

      const res = await invoke(router, "GET", "/api/ai/context/overview");

      expect(res.status).toBe(200);
      expect(seen).toEqual(["t-a"]);
      expect((await res.json()).data.sessionCount).toBe(3);
    });

    test("会话列表透传分页与排序", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(adminUser));

      await invoke(router, "GET", "/api/ai/context/sessions?page=2&pageSize=5&sort=tokens");

      expect(queries.seen).toHaveLength(1);
      expect(queries.seen[0]).toMatchObject({
        tenantId: "t-a", page: 2, pageSize: 5, sort: "tokens",
      });
    });

    test("会话详情命中时返回 200", async () => {
      const queries = createQueriesStub({ getDetail: async () => DETAIL_FIXTURE });
      const router = createContextRoutes(queries, withUser(adminUser));

      expect((await invoke(router, "GET", "/api/ai/context/sessions/:sessionId")).status).toBe(200);
    });
  });

  describe("2. 用户收窄（管理员可按用户筛选）", () => {
    test("显式传 userId 时下推给查询层", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(adminUser));

      await invoke(router, "GET", "/api/ai/context/sessions?userId=u-7");

      expect(queries.seen[0]?.userId).toBe("u-7");
    });

    test("不传 userId 时不追加用户条件（统计租户内全部用户）", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(adminUser));

      await invoke(router, "GET", "/api/ai/context/sessions");

      expect(queries.seen[0]?.userId).toBeUndefined();
    });

    test("空白 userId 视为未指定，不产生恒假筛选", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(adminUser));

      await invoke(router, "GET", "/api/ai/context/sessions?userId=%20%20");

      expect(queries.seen[0]?.userId).toBeUndefined();
    });

    test("概览同样支持 userId 收窄", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(adminUser));

      await invoke(router, "GET", "/api/ai/context/overview?userId=u-7");
      await invoke(router, "GET", "/api/ai/context/overview");

      expect(queries.overviewScopes[0]).toEqual({ userId: "u-7" });
      expect(queries.overviewScopes[1]).toBeUndefined();
    });
  });

  describe("3. 管理员门禁（调试信息，非 admin 一律 403）", () => {
    test("普通已认证用户访问概览返回 403", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(normalUser));

      const res = await invoke(router, "GET", "/api/ai/context/overview");

      expect(res.status).toBe(403);
      expect(queries.overviewScopes).toHaveLength(0);
    });

    test("普通用户访问会话列表与详情同样 403", async () => {
      const queries = createQueriesStub({ getDetail: async () => DETAIL_FIXTURE });
      const router = createContextRoutes(queries, withUser(normalUser));

      expect((await invoke(router, "GET", "/api/ai/context/sessions")).status).toBe(403);
      expect((await invoke(router, "GET", "/api/ai/context/sessions/:sessionId")).status).toBe(403);
      expect(queries.seen).toHaveLength(0);
    });

    test("roles 缺失（非数组）按非管理员处理，不得放行", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser({ id: "u", tenantId: "t-a" }));

      expect((await invoke(router, "GET", "/api/ai/context/overview")).status).toBe(403);
    });

    test("多角色中含 admin 即可放行", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(
        queries,
        withUser({ id: "u", tenantId: "t-a", roles: ["user", "admin"] }),
      );

      expect((await invoke(router, "GET", "/api/ai/context/overview")).status).toBe(200);
    });

    test("403 响应不泄露任何上下文数据", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(normalUser));

      const body = await (await invoke(router, "GET", "/api/ai/context/overview")).text();

      expect(body).not.toContain("sessionCount");
      expect(body).not.toContain("composition");
    });
  });

  describe("4. 跨租户不可见", () => {
    test("其他租户的会话详情返回空数据，不泄露对方数据", async () => {
      // getDetail 带租户过滤：跨租户查询返回 null。路由将其降级为空详情（200），
      // 与「本会话无记录」同形状 —— 无论会话是否真实存在、是否跨租户，
      // 响应都一致，不暴露资源存在性（也消除了 404 侧信道）。
      const queries = createQueriesStub({ getDetail: async () => null });
      const router = createContextRoutes(queries, withUser(adminUser));

      const res = await invoke(router, "GET", "/api/ai/context/sessions/:sessionId");

      expect(res.status).toBe(200);
      const body = await res.json();
      // 空详情：与「本会话无记录」同形状，无任何数据
      expect(body.data.requests).toEqual([]);
      expect(body.data.nodes).toEqual([]);
      expect(body.data.events).toEqual([]);
      expect(body.data.archive).toEqual([]);
      expect(body.data.fileOps).toEqual([]);
      expect(body.data.rev).toBe(0);
      // getDetail 返回 null（跨租户 / 无记录）时路由不会把它透传给客户端，
      // 响应里不含任何会话内容字段（如正常详情才有的 lastUser / 模型 / runCount 计数）
      expect(body.data.session.lastUser).toBeNull();
      expect(body.data.session.runCount).toBe(0);
    });
  });

  describe("5. 未认证 / 缺失租户 fail-closed", () => {
    test("完全没有用户上下文时返回 401", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(undefined));

      const res = await invoke(router, "GET", "/api/ai/context/overview");

      expect(res.status).toBe(401);
      expect(queries.overviewScopes).toHaveLength(0);
    });

    test("有用户但缺失 tenantId 时返回 403（不得退化为默认租户）", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(
        queries,
        withUser({ ...adminUser, tenantId: undefined }),
      );

      const res = await invoke(router, "GET", "/api/ai/context/sessions");

      expect(res.status).toBe(403);
      expect(queries.seen).toHaveLength(0);
    });

    test("tenantId 为空白字符串同样 403", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser({ ...adminUser, tenantId: "   " }));

      expect((await invoke(router, "GET", "/api/ai/context/overview")).status).toBe(403);
    });

    test("未认证判定先于管理员判定", async () => {
      // 无 user 时应返回 401 而非 403，避免向未登录者暴露「该端点需要管理员」
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(undefined));

      expect((await invoke(router, "GET", "/api/ai/context/sessions")).status).toBe(401);
    });
  });

  describe("6. 输入校验", () => {
    test("非法 startTime 返回 400，不透传进 SQL", async () => {
      const queries = createQueriesStub();
      const router = createContextRoutes(queries, withUser(adminUser));

      const res = await invoke(router, "GET", "/api/ai/context/sessions?startTime=not-a-date");

      expect(res.status).toBe(400);
      expect(queries.seen).toHaveLength(0);
    });

    test("days 被夹到 1—365 区间", async () => {
      const seenDays: number[] = [];
      const queries = createQueriesStub({
        getOverview: async (_t: string, days: number) => {
          seenDays.push(days);
          return emptyOverview();
        },
      });
      const router = createContextRoutes(queries, withUser(adminUser));

      await invoke(router, "GET", "/api/ai/context/overview?days=9999");
      await invoke(router, "GET", "/api/ai/context/overview?days=0");
      await invoke(router, "GET", "/api/ai/context/overview?days=abc");

      expect(seenDays).toEqual([365, 1, 7]);
    });
  });
});
