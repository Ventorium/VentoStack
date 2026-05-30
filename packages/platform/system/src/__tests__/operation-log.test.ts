/**
 * @ventostack/system - OperationLogMiddleware 测试
 */

import { describe, expect, test } from "bun:test";
import { createOperationLogMiddleware } from "../middlewares/operation-log";
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
    expect(call.action).toContain("POST");
    expect(call.resource).toBe("operation");
    expect(call.result).toBe("success");
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
