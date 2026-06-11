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

  test("cleanup returns count", async () => {
    const { db } = createMockDatabase();
    const service = createApprovalService({ db });

    const count = await service.cleanup();
    expect(typeof count).toBe("number");
  });
});
