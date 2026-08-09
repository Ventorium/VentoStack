import { describe, test, expect } from "bun:test";
import { createApprovalService } from "../../services/approval";
import { createMockDatabase, createMockEventBus } from "../helpers";

describe("createApprovalService", () => {
  test("creates approval request", async () => {
    const { db } = createMockDatabase();
    const eventBus = createMockEventBus();
    const service = createApprovalService({ db, eventBus: eventBus as never });

    const result = await service.request("terminal", { command: "ls" }, "user1", "tenant1");
    expect(result.toolName).toBe("terminal");
    expect(result.status).toBe("pending");
    expect(result.id).toBeTruthy();
    expect(result.requestedBy).toBe("user1");
    expect(result.tenantId).toBe("tenant1");
  });

  test("approve updates status", async () => {
    const approvalRow = {
      id: "a1",
      toolName: "terminal",
      input: { command: "ls" },
      requestedBy: "user1",
      status: "approved",
      approvedBy: "admin1",
      comment: null,
      expiresAt: new Date().toISOString(),
      tenantId: "t1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { db } = createMockDatabase({
      "UPDATE ai_approval_request SET status = 'approved'": [],
      "SELECT id": [approvalRow],
    });
    const eventBus = createMockEventBus();
    const service = createApprovalService({ db, eventBus: eventBus as never });

    const result = await service.approve("a1", "admin1");
    expect(result).toBeDefined();
  });

  test("listPending returns array", async () => {
    const { db } = createMockDatabase({
      "WHERE tenant_id": [{
        id: "a1",
        toolName: "terminal",
        input: {},
        requestedBy: "user1",
        status: "pending",
        approvedBy: null,
        comment: null,
        expiresAt: new Date().toISOString(),
        tenantId: "t1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    });
    const service = createApprovalService({ db });

    const results = await service.listPending("t1");
    expect(Array.isArray(results)).toBe(true);
  });

  test("findRecentApproved returns approved request for the same user/tool/input", async () => {
    const approvedRow = {
      id: "a1",
      toolName: "terminal",
      input: { command: "ls" },
      requestedBy: "user1",
      status: "approved",
      approvedBy: "admin1",
      comment: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      tenantId: "t1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // 自定义 raw：仅当传入 input 参数与已批准参数一致时返回行（模拟 input::text = $4 过滤）
    const raw = async (_sql: string, params: unknown[]) => {
      const inputJson = params[3] as string;
      return inputJson === '{"command":"ls"}' ? [approvedRow] : [];
    };
    const service = createApprovalService({ db: { raw } as never });

    const result = await service.findRecentApproved("terminal", { command: "ls" }, "user1", "t1");
    expect(result).not.toBeNull();
    expect(result?.toolName).toBe("terminal");
    expect(result?.status).toBe("approved");
  });

  test("findRecentApproved returns null when input differs from approved request", async () => {
    const approvedRow = {
      id: "a1",
      toolName: "terminal",
      input: { command: "ls" },
      requestedBy: "user1",
      status: "approved",
      approvedBy: "admin1",
      comment: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      tenantId: "t1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const raw = async (_sql: string, params: unknown[]) => {
      const inputJson = params[3] as string;
      // 已批准的参数是 {"command":"ls"}，本次调用参数不同 → 不返回行
      return inputJson === '{"command":"ls"}' ? [approvedRow] : [];
    };
    const service = createApprovalService({ db: { raw } as never });

    const result = await service.findRecentApproved(
      "terminal",
      { command: "rm -rf /" },
      "user1",
      "t1",
    );
    expect(result).toBeNull();
  });

  test("findRecentApproved matches input regardless of key order", async () => {
    const approvedRow = {
      id: "a1",
      toolName: "terminal",
      input: { cwd: "/tmp", command: "ls" },
      requestedBy: "user1",
      status: "approved",
      approvedBy: "admin1",
      comment: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      tenantId: "t1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const raw = async (_sql: string, params: unknown[]) => {
      // canonicalJson 按键排序：{ command, cwd } 与 { cwd, command } 序列化一致
      const inputJson = params[3] as string;
      return inputJson === '{"command":"ls","cwd":"/tmp"}' ? [approvedRow] : [];
    };
    const service = createApprovalService({ db: { raw } as never });

    const result = await service.findRecentApproved(
      "terminal",
      { command: "ls", cwd: "/tmp" },
      "user1",
      "t1",
    );
    expect(result).not.toBeNull();
  });

  test("findRecentApproved returns null when no approved request exists", async () => {
    const { db } = createMockDatabase();
    const service = createApprovalService({ db });

    const result = await service.findRecentApproved("terminal", { command: "ls" }, "user1", "t1");
    expect(result).toBeNull();
  });

  test("cleanup returns count", async () => {
    const { db } = createMockDatabase();
    const service = createApprovalService({ db });

    const count = await service.cleanup();
    expect(typeof count).toBe("number");
  });
});
