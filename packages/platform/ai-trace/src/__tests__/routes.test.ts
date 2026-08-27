/**
 * @ventostack/ai-trace - 路由测试
 *
 * 覆盖：401 未认证 / 403 无权限 / 200 结构 / 租户隔离（tenantId 取自已验证用户）
 */

import { describe, expect, test } from "bun:test";
import { createAuthMiddleware, createPermMiddleware } from "@ventostack/auth";
import { createTraceRoutes } from "../routes/trace";
import type { TraceConfigService } from "../services/trace-config";
import type { TraceStore } from "../services/trace-store";
import { buildTestToken, createMockJWTManager, createMockRBAC } from "./helpers";

/** 记录调用的 mock store */
function createRecordingStore(overrides: Partial<TraceStore> = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const track = (method: string) => (arg1: unknown, arg2?: unknown, arg3?: unknown) => {
    calls.push({ method, args: [arg1, arg2, arg3] });
    if (method === "listConversations") {
      return { items: [], total: 0, page: 1, pageSize: 20 };
    }
    if (method === "listConversationMessages") return [];
    return null;
  };
  const store = {
    insertTrace: async () => {},
    updateTrace: async () => {},
    insertSpan: async () => {},
    updateSpan: async () => {},
    getTrace: track("getTrace") as TraceStore["getTrace"],
    getTraceDetail: track("getTraceDetail") as TraceStore["getTraceDetail"],
    listConversations: track("listConversations") as TraceStore["listConversations"],
    listConversationMessages: track(
      "listConversationMessages",
    ) as TraceStore["listConversationMessages"],
    markStaleTraces: async () => 0,
    ...overrides,
  } as TraceStore;
  return { store, calls };
}

function createMockConfig(initial = true): TraceConfigService & { setCalls: boolean[] } {
  let enabled = initial;
  const setCalls: boolean[] = [];
  return {
    isEnabled: async () => enabled,
    setEnabled: async (v: boolean) => {
      enabled = v;
      setCalls.push(v);
    },
    setCalls,
  };
}

type Compiled = Record<string, Record<string, (req: Request) => Promise<Response>>>;

function setupRoutes(opts: { hasPerm?: boolean } = {}) {
  const { store, calls } = createRecordingStore();
  const config = createMockConfig();
  const jwt = createMockJWTManager();
  const rbac = createMockRBAC();
  if (opts.hasPerm !== false) {
    const grant = rbac.grantPermission as unknown as (r: string, res: string, act: string) => void;
    grant("editor", "ai:trace", "list");
    grant("editor", "ai:trace", "config");
  }
  const router = createTraceRoutes(
    store,
    config,
    createAuthMiddleware(jwt as never, "test-secret"),
    createPermMiddleware(rbac as never),
  );
  const compiled = router.compile() as unknown as Compiled;
  return { compiled, calls, config };
}

const AUTH_PATHS = new Set([
  "/api/ai/trace/conversations",
  "/api/ai/trace/conversations/:id",
  "/api/ai/trace/traces/:traceId",
  "/api/ai/trace/config",
]);

function buildRequest(path: string, method = "GET", token?: string, body?: unknown): Request {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  (request as Request & { params?: Record<string, string> }).params = {};
  return request;
}

/** 测试用户 token：角色 editor + tenantId ten1 */
const testToken = buildTestToken({ sub: "u1", roles: ["editor"], username: "editor", tenantId: "ten1" });

describe("Trace Routes 安全", () => {
  test("未认证请求返回 401", async () => {
    const { compiled } = setupRoutes();
    for (const path of AUTH_PATHS) {
      const handler = compiled[path]!.GET ?? compiled[path]!.PUT!;
      const res = await handler(buildRequest(path, compiled[path]!.GET ? "GET" : "PUT"));
      expect(res.status).toBe(401);
    }
  });

  test("无 ai:trace:list 权限返回 403", async () => {
    const { compiled } = setupRoutes({ hasPerm: false });
    const handler = compiled["/api/ai/trace/conversations"]!.GET!;
    const res = await handler(buildRequest("/api/ai/trace/conversations", "GET", testToken));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toContain("ai:trace:list");
  });

  test("无 ai:trace:config 权限无法设置开关", async () => {
    const { compiled, config } = setupRoutes({ hasPerm: false });
    const handler = compiled["/api/ai/trace/config"]!.PUT!;
    const res = await handler(
      buildRequest("/api/ai/trace/config", "PUT", testToken, { enabled: false }),
    );
    expect(res.status).toBe(403);
    expect(config.setCalls).toHaveLength(0);
  });

  test("会话列表：200 + 分页结构 + 租户取自已验证用户", async () => {
    const { compiled, calls } = setupRoutes();
    const handler = compiled["/api/ai/trace/conversations"]!.GET!;
    const res = await handler(
      buildRequest("/api/ai/trace/conversations?page=1&pageSize=10", "GET", testToken),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: number; data: { list: unknown[]; total: number } };
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data.list)).toBe(true);

    // tenantId 必须来自 token（ten1），不信任查询参数
    const listCall = calls.find((c) => c.method === "listConversations");
    expect((listCall!.args[0] as { tenantId: string }).tenantId).toBe("ten1");
  });

  test("会话列表：未知查询字段（tenantId 伪造）被 schema 拒绝 400", async () => {
    const { compiled } = setupRoutes();
    const handler = compiled["/api/ai/trace/conversations"]!.GET!;
    const res = await handler(
      buildRequest("/api/ai/trace/conversations?tenantId=evil", "GET", testToken),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors?: string[] };
    expect(body.errors?.some((e) => e.includes("tenantId"))).toBe(true);
  });

  test("会话列表：非法时间格式返回 400", async () => {
    const { compiled, calls } = setupRoutes();
    const handler = compiled["/api/ai/trace/conversations"]!.GET!;
    const res = await handler(
      buildRequest("/api/ai/trace/conversations?startTime=not-a-date", "GET", testToken),
    );
    expect(res.status).toBe(400);
    expect(calls.find((c) => c.method === "listConversations")).toBeUndefined();
  });

  test("会话列表：合法 ISO 时间通过校验", async () => {
    const { compiled, calls } = setupRoutes();
    const handler = compiled["/api/ai/trace/conversations"]!.GET!;
    const res = await handler(
      buildRequest("/api/ai/trace/conversations?startTime=2026-01-01T00:00:00Z", "GET", testToken),
    );
    expect(res.status).toBe(200);
    const listCall = calls.find((c) => c.method === "listConversations");
    expect((listCall!.args[0] as { startTime?: string }).startTime).toBe("2026-01-01T00:00:00Z");
  });

  test("会话消息时间线：200 + 传参正确", async () => {
    const { compiled, calls } = setupRoutes();
    const handler = compiled["/api/ai/trace/conversations/:id"]!.GET!;
    const req = buildRequest("/api/ai/trace/conversations/conv-1", "GET", testToken);
    (req as Request & { params: Record<string, string> }).params = { id: "conv-1" };
    const res = await handler(req);
    expect(res.status).toBe(200);

    const call = calls.find((c) => c.method === "listConversationMessages");
    expect(call!.args[0]).toBe("conv-1");
    expect(call!.args[1]).toBe("ten1");
  });

  test("追踪详情：不存在时返回 404", async () => {
    const { compiled } = setupRoutes();
    const handler = compiled["/api/ai/trace/traces/:traceId"]!.GET!;
    const req = buildRequest("/api/ai/trace/traces/nope", "GET", testToken);
    (req as Request & { params: Record<string, string> }).params = { traceId: "nope" };
    const res = await handler(req);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: number };
    expect(body.code).toBe(404);
  });

  test("追踪详情：租户隔离强制 tenantId", async () => {
    const { compiled, calls } = setupRoutes();
    const handler = compiled["/api/ai/trace/traces/:traceId"]!.GET!;
    const req = buildRequest("/api/ai/trace/traces/t1", "GET", testToken);
    (req as Request & { params: Record<string, string> }).params = { traceId: "t1" };
    await handler(req);

    const call = calls.find((c) => c.method === "getTraceDetail");
    expect(call!.args).toEqual(["t1", "ten1"]);
  });

  test("开关查询：200 返回 enabled", async () => {
    const { compiled } = setupRoutes();
    const handler = compiled["/api/ai/trace/config"]!.GET!;
    const res = await handler(buildRequest("/api/ai/trace/config", "GET", testToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { enabled: boolean } };
    expect(body.data.enabled).toBe(true);
  });

  test("开关设置：合法 boolean 生效", async () => {
    const { compiled, config } = setupRoutes();
    const handler = compiled["/api/ai/trace/config"]!.PUT!;
    const res = await handler(
      buildRequest("/api/ai/trace/config", "PUT", testToken, { enabled: false }),
    );
    expect(res.status).toBe(200);
    expect(config.setCalls).toEqual([false]);
    const body = (await res.json()) as { data: { enabled: boolean } };
    expect(body.data.enabled).toBe(false);
  });

  test("开关设置：非 boolean 返回 400", async () => {
    const { compiled, config } = setupRoutes();
    const handler = compiled["/api/ai/trace/config"]!.PUT!;
    const res = await handler(
      buildRequest("/api/ai/trace/config", "PUT", testToken, { enabled: "yes" }),
    );
    expect(res.status).toBe(400);
    expect(config.setCalls).toHaveLength(0);
  });
});
