import { describe, test, expect } from "bun:test";
import { createApprovalService, createApprovalWaiter } from "../../services/approval";
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
      // RETURNING 生效：UPDATE 返回受影响行
      "UPDATE ai_approval_request SET status = 'approved'": [{ id: "a1" }],
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

  test("approve returns null for expired request（过期不可批）", async () => {
    const expiredPendingRow = {
      id: "a1",
      toolName: "terminal",
      input: { command: "ls" },
      requestedBy: "user1",
      // 过期未处理：状态仍是 pending，但 expires_at 已过
      status: "pending",
      approvedBy: null,
      comment: null,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      tenantId: "t1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { db } = createMockDatabase({
      "UPDATE ai_approval_request SET status = 'approved'": [],
      "SELECT id": [expiredPendingRow],
    });
    const service = createApprovalService({ db });

    const result = await service.approve("a1", "admin1");
    expect(result).toBeNull();
  });

  test("reject returns null for expired request", async () => {
    const expiredPendingRow = {
      id: "a1",
      toolName: "terminal",
      input: { command: "ls" },
      requestedBy: "user1",
      status: "pending",
      approvedBy: null,
      comment: null,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      tenantId: "t1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { db } = createMockDatabase({
      "UPDATE ai_approval_request SET status = 'rejected'": [],
      "SELECT id": [expiredPendingRow],
    });
    const service = createApprovalService({ db });

    const result = await service.reject("a1", "admin1");
    expect(result).toBeNull();
  });

  test("approve extends usage window from approval time（批准后重算有效期）", async () => {
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

    const { db, exec } = createMockDatabase({
      // RETURNING 生效：UPDATE 返回受影响行
      "UPDATE ai_approval_request SET status = 'approved'": [{ id: "a1" }],
      "SELECT id": [approvedRow],
    });
    const service = createApprovalService({ db });

    const before = Date.now();
    const result = await service.approve("a1", "admin1");
    expect(result).not.toBeNull();

    // UPDATE 调用的第 4 个参数应是批准时刻起算的新过期时间（约 10 分钟后）
    const updateCall = exec.calls.find((args) => String(args[0]).includes("SET status = 'approved'"));
    expect(updateCall).toBeDefined();
    const newExpiresAt = (updateCall![1] as unknown[])[2] as Date;
    expect(newExpiresAt).toBeInstanceOf(Date);
    expect(newExpiresAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(newExpiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 11 * 60 * 1000);
  });
});

describe("confirmByRequester（聊天内自确认）", () => {
  const pendingRow = {
    id: "a1",
    toolName: "terminal",
    input: { command: "ls" },
    requestedBy: "user1",
    status: "pending",
    approvedBy: null,
    comment: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    tenantId: "t1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  test("requester can confirm own pending request", async () => {
    const approvedRow = { ...pendingRow, status: "approved", approvedBy: "user1", comment: "[chat-self-confirm]" };
    // 第一次 SELECT（确认前）返回 pending，UPDATE 后的读回返回 approved
    let selects = 0;
    const raw = async (sql: string) => {
      if (sql.includes("UPDATE")) return [{ id: "a1" }];
      selects += 1;
      return selects === 1 ? [pendingRow] : [approvedRow];
    };
    const service = createApprovalService({ db: { raw } as never });

    const result = await service.confirmByRequester("a1", "user1", "t1", true);
    expect(result).not.toBeNull();
  });

  test("non-requester gets null（非本人不可确认）", async () => {
    const { db } = createMockDatabase({
      "SELECT id": [pendingRow],
    });
    const service = createApprovalService({ db });

    const result = await service.confirmByRequester("a1", "user2", "t1", true);
    expect(result).toBeNull();
  });

  test("returns null when update affects no rows（过期/已处理不可确认）", async () => {
    const { db } = createMockDatabase({
      "UPDATE ai_approval_request SET status = 'approved'": [],
      "SELECT id": [pendingRow],
    });
    const service = createApprovalService({ db });

    const result = await service.confirmByRequester("a1", "user1", "t1", true);
    expect(result).toBeNull();
  });

  test("requester can reject own pending request", async () => {
    const rejectedRow = { ...pendingRow, status: "rejected", approvedBy: "user1" };
    const { db } = createMockDatabase({
      "UPDATE ai_approval_request SET status = 'rejected'": [{ id: "a1" }],
      "SELECT id": [rejectedRow],
    });
    const service = createApprovalService({ db });

    const result = await service.confirmByRequester("a1", "user1", "t1", false, "不需要");
    expect(result).not.toBeNull();
  });
});

describe("createApprovalWaiter（审批等待器）", () => {
  function createFakeEventBus() {
    const handlers = new Map<string, Array<(payload: unknown) => void>>();
    return {
      on(event: { name: string }, handler: (payload: unknown) => void) {
        const list = handlers.get(event.name) ?? [];
        list.push(handler);
        handlers.set(event.name, list);
        return () => {
          const list = handlers.get(event.name) ?? [];
          const idx = list.indexOf(handler);
          if (idx >= 0) list.splice(idx, 1);
        };
      },
      emitSync(event: { name: string }, payload: unknown) {
        for (const handler of [...(handlers.get(event.name) ?? [])]) handler(payload);
      },
    };
  }

  test("resolves immediately when status is already approved（竞态兜底）", async () => {
    const waiter = createApprovalWaiter({
      getStatus: async () => ({ id: "a1", toolName: "terminal", input: {}, requestedBy: "u1", status: "approved", approvedBy: "u1", comment: null, expiresAt: new Date(Date.now() + 60_000).toISOString(), tenantId: "t1", createdAt: "", updatedAt: "" }),
    });
    const result = await waiter({ id: "a1", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(result.approved).toBe(true);
  });

  test("wakes on matching approval event and ignores other ids", async () => {
    const bus = createFakeEventBus();
    let call = 0;
    const waiter = createApprovalWaiter({
      getStatus: async () => {
        call += 1;
        return call === 1
          ? { id: "a1", toolName: "terminal", input: {}, requestedBy: "u1", status: "pending", approvedBy: null, comment: null, expiresAt: new Date(Date.now() + 60_000).toISOString(), tenantId: "t1", createdAt: "", updatedAt: "" }
          : null;
      },
      eventBus: bus as never,
    });

    const pending = waiter({ id: "a1", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    // 先广播一条不相关 id（不应唤醒），再广播匹配 id
    bus.emitSync({ name: "ai.approval.approved" }, { id: "other", toolName: "x" });
    await new Promise((r) => setTimeout(r, 5));
    bus.emitSync({ name: "ai.approval.approved" }, { id: "a1", toolName: "terminal", reviewedBy: "u1", tenantId: "t1" });
    const result = await pending;
    expect(result.approved).toBe(true);
  });

  test("returns deny on abort（断开连接不挂死）", async () => {
    const waiter = createApprovalWaiter({
      getStatus: async () => ({ id: "a1", toolName: "terminal", input: {}, requestedBy: "u1", status: "pending", approvedBy: null, comment: null, expiresAt: new Date(Date.now() + 60_000).toISOString(), tenantId: "t1", createdAt: "", updatedAt: "" }),
    });
    const controller = new AbortController();
    const pending = waiter({ id: "a1", expiresAt: new Date(Date.now() + 60_000).toISOString() }, controller.signal);
    controller.abort();
    const result = await pending;
    expect(result.approved).toBe(false);
  });
});
