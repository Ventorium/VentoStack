/**
 * engine/assignee.ts 测试 — 5 种审批人解析模式 + 边界
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createAssigneeResolver, resolveInitiatorDetail } from "../../engine/assignee";
import type { ApproveNodeConfig } from "../../engine/assignee";
import type { GraphNode, EngineContext } from "../../engine/graph";
import { createMockDatabase, createMockExecutor } from "../helpers";

function makeNode(config: ApproveNodeConfig | null): GraphNode {
  return {
    id: "n1", name: "审批", type: "approve", config: config as unknown as Record<string, unknown>,
    outgoingEdges: [], incomingEdges: [],
  };
}

function makeCtx(overrides?: Partial<EngineContext>): EngineContext {
  return {
    instanceId: "i1", formData: { approver_id: "user-form", days: 5 },
    variables: {}, initiator: { id: "u1", deptId: "dept-1" }, operatorId: "u1",
    ...overrides,
  };
}

describe("AssigneeResolver", () => {
  let results: ReturnType<typeof createMockExecutor>["results"];
  let db: ReturnType<typeof createMockDatabase>["db"];
  let resolver: ReturnType<typeof createAssigneeResolver>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
    resolver = createAssigneeResolver({ db });
  });

  describe("mode: fixed", () => {
    it("should return userIds from config", async () => {
      const node = makeNode({ assignee: { mode: "fixed", userIds: ["u1", "u2"] } });
      expect(await resolver.resolve(node, makeCtx())).toEqual(["u1", "u2"]);
    });

    it("should return empty when userIds not set", async () => {
      const node = makeNode({ assignee: { mode: "fixed" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual([]);
    });
  });

  describe("mode: role", () => {
    it("should query sys_user_role by roleId", async () => {
      results.set("SELECT user_id FROM sys_user_role WHERE role_id", [
        { user_id: "u10" }, { user_id: "u11" },
      ]);
      const node = makeNode({ assignee: { mode: "role", roleId: "role-1" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual(["u10", "u11"]);
    });

    it("should return empty when roleId missing", async () => {
      const node = makeNode({ assignee: { mode: "role" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual([]);
    });

    it("should return empty when no users have role", async () => {
      results.set("SELECT user_id FROM sys_user_role WHERE role_id", []);
      const node = makeNode({ assignee: { mode: "role", roleId: "role-empty" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual([]);
    });
  });

  describe("mode: department", () => {
    it("should query sys_user by deptId", async () => {
      results.set("SELECT id FROM sys_user WHERE dept_id", [{ id: "u20" }, { id: "u21" }]);
      const node = makeNode({ assignee: { mode: "department", deptId: "dept-1" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual(["u20", "u21"]);
    });

    it("should return empty when deptId missing", async () => {
      const node = makeNode({ assignee: { mode: "department" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual([]);
    });
  });

  describe("mode: lookup", () => {
    // Helper: mock resolveInitiatorDetail queries
    function setupInitiatorMocks(superiorId?: string | null, deptId?: string | null) {
      results.set("SELECT id, nickname, dept_id FROM sys_user WHERE id", [{
        id: "u1", nickname: "张三", dept_id: deptId ?? "dept-1",
      }]);
      results.set("SELECT r.code FROM sys_role r JOIN", []);
      results.set("SELECT leader FROM sys_dept WHERE id", [{ leader: superiorId ?? null }]);
    }

    it("initiator_superior — should return superior", async () => {
      setupInitiatorMocks("leader-1");
      const node = makeNode({ assignee: { mode: "lookup", lookupKey: "initiator_superior" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual(["leader-1"]);
    });

    it("initiator_superior — no superior → empty", async () => {
      setupInitiatorMocks(null);
      const node = makeNode({ assignee: { mode: "lookup", lookupKey: "initiator_superior" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual([]);
    });

    it("initiator_dept_leader — should return dept leader", async () => {
      setupInitiatorMocks("dept-leader-1");
      const node = makeNode({ assignee: { mode: "lookup", lookupKey: "initiator_dept_leader" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual(["dept-leader-1"]);
    });

    it("initiator_dept_hr — should return HR users in dept", async () => {
      setupInitiatorMocks(null);
      results.set("SELECT ur.user_id FROM sys_user_role ur", [{ user_id: "hr-user-1" }]);
      const node = makeNode({ assignee: { mode: "lookup", lookupKey: "initiator_dept_hr" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual(["hr-user-1"]);
    });

    it("initiator_dept_hr — no dept → empty", async () => {
      results.set("SELECT id, nickname, dept_id FROM sys_user WHERE id", [{
        id: "u1", nickname: "张三", dept_id: null,
      }]);
      results.set("SELECT r.code FROM sys_role r JOIN", []);
      const node = makeNode({ assignee: { mode: "lookup", lookupKey: "initiator_dept_hr" } });
      expect(await resolver.resolve(node, makeCtx({ initiator: { id: "u1" } }))).toEqual([]);
    });

    it("last_approver_superior — TODO returns empty", async () => {
      setupInitiatorMocks("leader-1");
      const node = makeNode({ assignee: { mode: "lookup", lookupKey: "last_approver_superior" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual([]);
    });

    it("unknown lookupKey → empty", async () => {
      setupInitiatorMocks();
      const node = makeNode({ assignee: { mode: "lookup", lookupKey: "unknown" as any } });
      expect(await resolver.resolve(node, makeCtx())).toEqual([]);
    });
  });

  describe("mode: form_field", () => {
    it("should resolve userId from formData", async () => {
      results.set("SELECT id FROM sys_user WHERE id", [{ id: "user-form" }]);
      const node = makeNode({ assignee: { mode: "form_field", formField: "approver_id" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual(["user-form"]);
    });

    it("should throw when user not found", async () => {
      results.set("SELECT id FROM sys_user WHERE id", []);
      const node = makeNode({ assignee: { mode: "form_field", formField: "approver_id" } });
      await expect(resolver.resolve(node, makeCtx())).rejects.toThrow("表单指定的审批人");
    });

    it("should return empty when field not in formData", async () => {
      const node = makeNode({ assignee: { mode: "form_field", formField: "nonexistent" } });
      expect(await resolver.resolve(node, makeCtx({ formData: {} }))).toEqual([]);
    });

    it("should return empty when formField not set", async () => {
      const node = makeNode({ assignee: { mode: "form_field" } });
      expect(await resolver.resolve(node, makeCtx())).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("should return empty when no assignee config", async () => {
      expect(await resolver.resolve(makeNode({}), makeCtx())).toEqual([]);
    });

    it("should return empty when config is null", async () => {
      expect(await resolver.resolve(makeNode(null), makeCtx())).toEqual([]);
    });

    it("should return empty for unknown mode", async () => {
      expect(await resolver.resolve(makeNode({ assignee: { mode: "unknown" as any } }), makeCtx())).toEqual([]);
    });
  });
});

describe("resolveInitiatorDetail", () => {
  let results: ReturnType<typeof createMockExecutor>["results"];
  let db: ReturnType<typeof createMockDatabase>["db"];

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
  });

  it("should return full initiator detail", async () => {
    results.set("SELECT id, nickname, dept_id FROM sys_user WHERE id", [{
      id: "u1", nickname: "张三", dept_id: "dept-1",
    }]);
    results.set("SELECT r.code FROM sys_role r JOIN", [{ code: "admin" }, { code: "user" }]);
    results.set("SELECT leader FROM sys_dept WHERE id", [{ leader: "leader-1" }]);

    const detail = await resolveInitiatorDetail(db, "u1");
    expect(detail.id).toBe("u1");
    expect(detail.name).toBe("张三");
    expect(detail.deptId).toBe("dept-1");
    expect(detail.roles).toEqual(["admin", "user"]);
    expect(detail.superiorId).toBe("leader-1");
  });

  it("should return minimal when user not found", async () => {
    results.set("SELECT id, nickname, dept_id FROM sys_user WHERE id", []);
    const detail = await resolveInitiatorDetail(db, "unknown");
    expect(detail.id).toBe("unknown");
    expect(detail.name).toBeUndefined();
  });

  it("should handle user without dept", async () => {
    results.set("SELECT id, nickname, dept_id FROM sys_user WHERE id", [{
      id: "u1", nickname: "张三", dept_id: null,
    }]);
    results.set("SELECT r.code FROM sys_role r JOIN", []);
    const detail = await resolveInitiatorDetail(db, "u1");
    expect(detail.deptId).toBeUndefined();
    expect(detail.superiorId).toBeUndefined();
  });
});
