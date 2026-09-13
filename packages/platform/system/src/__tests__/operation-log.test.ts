/**
 * @ventostack/system - OperationLogMiddleware 测试
 */

import { describe, expect, mock, test } from "bun:test";
import {
  createOperationLogMiddleware,
  resolveOperationAction,
} from "../middlewares/operation-log";
import { createMockAuditStore } from "./helpers";

function mockCtx(
  overrides: Partial<{
    method: string;
    path: string;
    user: unknown;
    body: unknown;
    request: Request;
  }> = {},
) {
  const method = overrides.method ?? "POST";
  const path = overrides.path ?? "/api/test";
  const req = overrides.request ?? new Request(`http://localhost${path}`, { method });
  return {
    method,
    path,
    user: overrides.user ?? { id: "u1", username: "admin" },
    body: overrides.body,
    request: req,
  } as any;
}

function mockNext(response?: { status: number }) {
  return async () => new Response(null, { status: response?.status ?? 200 });
}

describe("OperationLogMiddleware", () => {
  test("all system write routes have readable Chinese action descriptions", () => {
    const routes = {
      "POST /api/system/users/batch-delete": "批量删除用户",
      "POST /api/system/users/batch-reset-pwd": "批量重置密码",
      "PUT /api/system/users/u-1/blacklist": "更新用户黑名单",
      "PUT /api/system/users/u-1/tags": "分配用户标签",
      "PUT /api/system/roles/r-1/menus": "分配角色菜单",
      "PUT /api/system/roles/r-1/data-scope": "分配角色数据权限",
      "POST /api/system/roles/batch-delete": "批量删除角色",
      "POST /api/system/depts/batch-delete": "批量删除部门",
      "POST /api/system/posts/batch-delete": "批量删除岗位",
      "POST /api/system/dict/data": "新增字典数据",
      "POST /api/system/dict/data/batch-delete": "批量删除字典数据",
      "PUT /api/system/dict/types/sys_user_status": "编辑字典类型",
      "POST /api/system/notices/batch-read": "批量标记已读",
      "POST /api/system/tags": "新增标签",
      "PUT /api/system/tags/tag-code": "编辑标签",
      "PUT /api/system/user/profile/password": "修改个人密码",
      "POST /api/system/user/profile/avatar": "更新头像",
    } as const;

    for (const [route, description] of Object.entries(routes)) {
      const separator = route.indexOf(" ");
      expect(resolveOperationAction(route.slice(0, separator), route.slice(separator + 1))).toBe(
        description,
      );
    }
  });

  test("unknown future write routes use a Chinese module fallback", () => {
    expect(resolveOperationAction("PATCH", "/api/system/users/u-1/future-action")).toBe(
      "用户管理操作",
    );
  });

  test("legacy method and URL actions can be localized when read", () => {
    expect(resolveOperationAction("PUT", "/api/system/users/string-id/tags")).toBe(
      "分配用户标签",
    );
  });

  test("platform write routes have Chinese action descriptions", () => {
    expect(resolveOperationAction("POST", "/api/system/notification/send-by-posts")).toBe(
      "按岗位发送通知",
    );
    expect(resolveOperationAction("POST", "/api/workflow/tasks/task-1/approve")).toBe(
      "审批通过",
    );
    expect(resolveOperationAction("PUT", "/api/system/gen/columns/column-1")).toBe(
      "编辑生成字段配置",
    );
    expect(resolveOperationAction("DELETE", "/api/i18n/messages/message-key")).toBe(
      "删除国际化文案",
    );
  });

  test("skips GET requests", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "GET" });
    await middleware(ctx, mockNext());
    expect(auditLog.append).not.toHaveBeenCalled();
  });

  test("skips HEAD requests", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "HEAD" });
    await middleware(ctx, mockNext());
    expect(auditLog.append).not.toHaveBeenCalled();
  });

  test("skips OPTIONS requests", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "OPTIONS" });
    await middleware(ctx, mockNext());
    expect(auditLog.append).not.toHaveBeenCalled();
  });

  test("records POST operations", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "POST", path: "/api/users", body: { name: "test" } });
    await middleware(ctx, mockNext());
    expect(auditLog.append).toHaveBeenCalledTimes(1);
    const call = (auditLog.append as any).mock.calls[0][0];
    expect(call.action).toBe("其他操作");
    expect(call.action).not.toContain("/api/");
    expect(call.resource).toBe("operation");
    expect(call.result).toBe("success");
  });

  test("records the server-injected direct client IP", async () => {
    const auditLog = createMockAuditStore();
    const saveToDb = mock(async () => {});
    const middleware = createOperationLogMiddleware(auditLog, { saveToDb });
    const request = new Request("http://localhost/api/system/users", {
      method: "POST",
      headers: { "x-real-ip": "127.0.0.1" },
    });

    await middleware(mockCtx({ request }), mockNext());

    expect(saveToDb).toHaveBeenCalledTimes(1);
    expect(saveToDb.mock.calls[0]?.[0].ip).toBe("127.0.0.1");
    expect(saveToDb.mock.calls[0]?.[0].location).toBe("本机");
  });

  test("only accepts forwarded IP from a trusted direct proxy", async () => {
    const auditLog = createMockAuditStore();
    const saveToDb = mock(async () => {});
    const middleware = createOperationLogMiddleware(auditLog, {
      saveToDb,
      trustedProxies: ["10.0.0.0/8"],
    });
    const request = new Request("http://localhost/api/system/users", {
      method: "POST",
      headers: {
        "x-real-ip": "10.0.0.2",
        "x-forwarded-for": "203.0.113.9",
      },
    });

    await middleware(mockCtx({ request }), mockNext());

    expect(saveToDb.mock.calls[0]?.[0].ip).toBe("203.0.113.9");
    expect(saveToDb.mock.calls[0]?.[0].location).toBe("未知");
  });

  test("records PUT operations", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "PUT", path: "/api/users/1" });
    await middleware(ctx, mockNext());
    expect(auditLog.append).toHaveBeenCalledTimes(1);
  });

  test("records DELETE operations", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "DELETE", path: "/api/users/1" });
    await middleware(ctx, mockNext());
    expect(auditLog.append).toHaveBeenCalledTimes(1);
  });

  test("sanitizes sensitive fields in body", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({
      method: "POST",
      body: { username: "admin", password: "secret123", email: "test@example.com" },
    });
    await middleware(ctx, mockNext());
    const call = (auditLog.append as any).mock.calls[0][0];
    const body = call.metadata.body;
    expect(body.password).toBe("******");
    expect(body.email).toBe("******");
    expect(body.username).toBe("admin");
  });

  test("sanitizes nested sensitive fields", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({
      method: "POST",
      body: { profile: { phone: "13800138000", name: "test" } },
    });
    await middleware(ctx, mockNext());
    const call = (auditLog.append as any).mock.calls[0][0];
    const body = call.metadata.body;
    expect(body.profile.phone).toBe("******");
    expect(body.profile.name).toBe("test");
  });

  test("skips excluded paths", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog, {
      excludePaths: ["/api/health"],
    });
    const ctx = mockCtx({ method: "POST", path: "/api/health" });
    await middleware(ctx, mockNext());
    expect(auditLog.append).not.toHaveBeenCalled();
  });

  test("records failure when handler throws", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "POST" });
    const failingNext = async () => {
      throw new Error("Internal error");
    };
    await expect(middleware(ctx, failingNext)).rejects.toThrow("Internal error");
    expect(auditLog.append).toHaveBeenCalledTimes(1);
    const call = (auditLog.append as any).mock.calls[0][0];
    expect(call.result).toBe("failure");
    expect(call.metadata.errorMsg).toBe("Internal error");
  });

  test("uses anonymous actor when no user in context", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "POST" });
    ctx.user = undefined;
    await middleware(ctx, mockNext());
    const call = (auditLog.append as any).mock.calls[0][0];
    expect(call.actor).toBe("anonymous");
  });

  test("uses user ID when username not available", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "POST", user: { id: "u1" } });
    await middleware(ctx, mockNext());
    const call = (auditLog.append as any).mock.calls[0][0];
    expect(call.actor).toBe("u1");
  });

  test("records duration in metadata", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog);
    const ctx = mockCtx({ method: "POST" });
    await middleware(ctx, mockNext());
    const call = (auditLog.append as any).mock.calls[0][0];
    expect(typeof call.metadata.duration).toBe("number");
    expect(call.metadata.duration).toBeGreaterThanOrEqual(0);
  });

  test("adds custom sensitive fields", async () => {
    const auditLog = createMockAuditStore();
    const middleware = createOperationLogMiddleware(auditLog, {
      sensitiveFields: ["customSecret"],
    });
    const ctx = mockCtx({
      method: "POST",
      body: { customSecret: "top-secret", normal: "visible" },
    });
    await middleware(ctx, mockNext());
    const call = (auditLog.append as any).mock.calls[0][0];
    const body = call.metadata.body;
    expect(body.customSecret).toBe("******");
    expect(body.normal).toBe("visible");
  });
});
