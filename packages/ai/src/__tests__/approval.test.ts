import { describe, test, expect } from "bun:test";
import { createApprovalManager } from "../approval";

describe("ApprovalManager", () => {
  test("request 创建", async () => {
    const manager = createApprovalManager();
    const req = await manager.request("dangerous-tool", { target: "db" }, "user-1");
    expect(req.id).toBeDefined();
    expect(req.toolName).toBe("dangerous-tool");
    expect(req.params).toEqual({ target: "db" });
    expect(req.requestedBy).toBe("user-1");
    expect(req.status).toBe("pending");
    expect(req.expiresAt).toBeGreaterThan(Date.now());
  });

  test("approve 通过", async () => {
    const manager = createApprovalManager();
    const req = await manager.request("tool", {}, "user-1");
    const approved = manager.approve(req.id, "admin", "Looks safe");
    expect(approved).not.toBeNull();
    expect(approved!.status).toBe("approved");
    expect(approved!.reviewedBy).toBe("admin");
    expect(approved!.reason).toBe("Looks safe");
    expect(approved!.reviewedAt).toBeGreaterThan(0);
  });

  test("reject 拒绝", async () => {
    const manager = createApprovalManager();
    const req = await manager.request("tool", {}, "user-1");
    const rejected = manager.reject(req.id, "admin", "Too risky");
    expect(rejected).not.toBeNull();
    expect(rejected!.status).toBe("rejected");
    expect(rejected!.reviewedBy).toBe("admin");
    expect(rejected!.reason).toBe("Too risky");
  });

  test("getStatus 查询", async () => {
    const manager = createApprovalManager();
    const req = await manager.request("tool", {}, "user-1");
    const status = manager.getStatus(req.id);
    expect(status).not.toBeNull();
    expect(status!.toolName).toBe("tool");
    expect(manager.getStatus("nonexistent")).toBeNull();
  });

  test("listPending 列表", async () => {
    const manager = createApprovalManager();
    await manager.request("tool-a", {}, "user-1");
    await manager.request("tool-b", {}, "user-1");
    const req3 = await manager.request("tool-c", {}, "user-1");
    manager.approve(req3.id, "admin");
    const pending = manager.listPending();
    expect(pending).toHaveLength(2);
  });

  test("重复审批返回 null", async () => {
    const manager = createApprovalManager();
    const req = await manager.request("tool", {}, "user-1");
    manager.approve(req.id, "admin");
    expect(manager.approve(req.id, "admin-2")).toBeNull();
    expect(manager.reject(req.id, "admin-2")).toBeNull();
  });

  test("过期请求", async () => {
    const manager = createApprovalManager({ defaultTTL: 1 });
    const req = await manager.request("tool", {}, "user-1");
    await new Promise((r) => setTimeout(r, 10));
    // 过期后 approve 应返回 null
    expect(manager.approve(req.id, "admin")).toBeNull();
  });

  test("cleanup 清理", async () => {
    const manager = createApprovalManager({ defaultTTL: 1 });
    await manager.request("tool-a", {}, "user-1");
    await manager.request("tool-b", {}, "user-1");
    await new Promise((r) => setTimeout(r, 10));
    const cleaned = manager.cleanup();
    expect(cleaned).toBe(2);
    expect(manager.listPending()).toHaveLength(0);
  });

  test("onRequest 回调", async () => {
    let captured: unknown = null;
    const manager = createApprovalManager({
      onRequest: (req) => {
        captured = req;
      },
    });
    const req = await manager.request("tool", {}, "user-1");
    expect(captured).toBe(req);
  });

  test("onReview 回调", async () => {
    let captured: unknown = null;
    const manager = createApprovalManager({
      onReview: (req) => {
        captured = req;
      },
    });
    const req = await manager.request("tool", {}, "user-1");
    manager.approve(req.id, "admin");
    expect(captured).not.toBeNull();
    expect((captured as { status: string }).status).toBe("approved");
  });

  test("reject 后 onReview 回调", async () => {
    let captured: unknown = null;
    const manager = createApprovalManager({
      onReview: (req) => {
        captured = req;
      },
    });
    const req = await manager.request("tool", {}, "user-1");
    manager.reject(req.id, "admin", "nope");
    expect((captured as { status: string }).status).toBe("rejected");
  });
});
