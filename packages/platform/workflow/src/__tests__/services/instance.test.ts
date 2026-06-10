/**
 * services/instance.ts 测试
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createInstanceService, InstanceStatus } from "../../services/instance";
import { createMockDatabase, createMockExecutor } from "../helpers";
import { createAssigneeResolver } from "../../engine/assignee";

// 定义图：start → approve(u1) → end
const defRow = { id: "def-1", version: 1, status: 1 };
const startNode = { id: "n-start", definition_id: "def-1", name: "开始", type: "start", config: null, position_x: 0, position_y: 0, sort: 0 };
const approveNode = { id: "n-approve", definition_id: "def-1", name: "审批", type: "approve",
  config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["user-1"] } },
  position_x: 200, position_y: 0, sort: 1 };
const endNode = { id: "n-end", definition_id: "def-1", name: "结束", type: "end", config: null, position_x: 400, position_y: 0, sort: 2 };
const edge1 = { id: "e1", source_node_id: "n-start", target_node_id: "n-approve", name: null, sort: 0 };
const edge2 = { id: "e2", source_node_id: "n-approve", target_node_id: "n-end", name: null, sort: 1 };

function setupGraphResults(results: Map<string, unknown[]>) {
  results.set("SELECT * FROM sys_workflow_definition WHERE id", [defRow]);
  results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [startNode, approveNode, endNode]);
  results.set("SELECT * FROM sys_workflow_edge WHERE definition_id", [edge1, edge2]);
}

describe("InstanceService", () => {
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let db: ReturnType<typeof createMockDatabase>["db"];
  let service: ReturnType<typeof createInstanceService>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ calls, results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
    const assigneeResolver = createAssigneeResolver({ db });
    service = createInstanceService({ db, assigneeResolver });
  });

  describe("start", () => {
    it("should insert instance and create first task", async () => {
      setupGraphResults(results);
      const result = await service.start({
        definitionId: "def-1", initiatorId: "user-1", formData: { days: 3 },
      });
      expect(result.instanceId).toBeTruthy();
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_instance"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_task"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });

    it("should throw when definition not found", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", []);
      await expect(service.start({ definitionId: "nonexistent", initiatorId: "u1", formData: {} }))
        .rejects.toThrow("流程定义不存在");
    });

    it("should throw when definition not active", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [{ id: "def-1", version: 1, status: 0 }]);
      await expect(service.start({ definitionId: "def-1", initiatorId: "u1", formData: {} }))
        .rejects.toThrow("流程定义未发布");
    });

    it("should store form_data and title", async () => {
      setupGraphResults(results);
      await service.start({
        definitionId: "def-1", initiatorId: "user-1",
        title: "请假申请", formData: { days: 3, reason: "年假" },
      });
      const insertCall = calls.find((c) => c.text.includes("INSERT INTO sys_workflow_instance"));
      expect(insertCall).toBeTruthy();
      expect(insertCall!.params).toContain("请假申请");
    });
  });

  describe("getDetail", () => {
    it("should return null when not found", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", []);
      const detail = await service.getDetail("nonexistent");
      expect(detail).toBeNull();
    });

    it("should return instance detail with tasks and history", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", definition_id: "def-1", definition_ver: 1,
        business_type: null, business_id: null, initiator_id: "u1",
        title: "请假", status: 0, form_data: null, variables: null,
        graph_snapshot: JSON.stringify({ nodes: [startNode, approveNode, endNode], edges: [edge1, edge2] }),
        resubmit_of: null, tenant_id: "default", started_at: new Date(), ended_at: null, created_at: new Date(),
      }]);
      results.set("SELECT * FROM sys_workflow_task WHERE instance_id", []);
      results.set("SELECT * FROM sys_workflow_history WHERE instance_id", []);

      const detail = await service.getDetail("inst-1");
      expect(detail).not.toBeNull();
      expect(detail!.instance.id).toBe("inst-1");
      expect(detail!.instance.title).toBe("请假");
      expect(detail!.graph.nodes.length).toBe(3);
    });
  });

  describe("listMy", () => {
    it("should list with pagination", async () => {
      results.set("SELECT COUNT(*)", [{ count: 1 }]);
      results.set("SELECT * FROM sys_workflow_instance WHERE initiator_id", [{
        id: "inst-1", definition_id: "def-1", definition_ver: 1,
        business_type: null, business_id: null, initiator_id: "u1",
        title: null, status: 0, form_data: null, variables: null,
        resubmit_of: null, tenant_id: null, started_at: null, ended_at: null, created_at: new Date(),
      }]);
      const result = await service.listMy("u1", { page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.items[0]!.id).toBe("inst-1");
    });
  });

  describe("withdraw", () => {
    it("should void pending tasks and mark withdrawn", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", initiator_id: "u1", status: InstanceStatus.RUNNING,
      }]);
      results.set("SELECT * FROM sys_workflow_task WHERE instance_id", [{ id: "t1", status: 0 }]);
      await service.withdraw("inst-1", "u1", "不想申请了");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status"))).toBe(true);
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });

    it("should throw when not initiator", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", initiator_id: "u1", status: InstanceStatus.RUNNING,
      }]);
      await expect(service.withdraw("inst-1", "u2")).rejects.toThrow("只有发起人可以撤回");
    });

    it("should throw when not running", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", initiator_id: "u1", status: InstanceStatus.COMPLETED,
      }]);
      await expect(service.withdraw("inst-1", "u1")).rejects.toThrow("实例不在进行中");
    });

    it("should throw when someone has acted", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", initiator_id: "u1", status: InstanceStatus.RUNNING,
      }]);
      results.set("SELECT * FROM sys_workflow_task WHERE instance_id", [{ id: "t1", status: 1 }]);
      await expect(service.withdraw("inst-1", "u1")).rejects.toThrow("已有审批人操作，无法撤回");
    });
  });

  describe("cancel", () => {
    it("should mark instance as cancelled", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", status: InstanceStatus.RUNNING,
      }]);
      await service.cancel("inst-1", "admin", "管理员终止");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });
  });

  describe("resubmit", () => {
    it("should throw when instance not found", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", []);
      await expect(service.resubmit("nonexistent", "u1", {})).rejects.toThrow("实例不存在");
    });

    it("should throw when not initiator", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", definition_id: "def-1", business_type: null,
        business_id: null, title: null, status: InstanceStatus.REJECTED, initiator_id: "u1",
      }]);
      await expect(service.resubmit("inst-1", "u2", {})).rejects.toThrow("只有发起人");
    });

    it("should throw when status is not rejected/withdrawn", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", definition_id: "def-1", business_type: null,
        business_id: null, title: null, status: InstanceStatus.RUNNING, initiator_id: "u1",
      }]);
      await expect(service.resubmit("inst-1", "u1", {})).rejects.toThrow("只有已拒绝或已撤回");
    });

    it("should start new instance from rejected one", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", definition_id: "def-1", business_type: null,
        business_id: null, title: "请假", status: InstanceStatus.REJECTED, initiator_id: "u1",
      }]);
      setupGraphResults(results);
      const result = await service.resubmit("inst-1", "u1", { days: 5 });
      expect(result.instanceId).toBeTruthy();
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_instance"))).toBe(true);
    });
  });

  describe("getHistory", () => {
    it("should return history sorted by created_at", async () => {
      results.set("SELECT * FROM sys_workflow_history WHERE instance_id", [
        { id: "h1", instance_id: "inst-1", node_id: "n1", task_id: null,
          operator_id: "u1", action: "start", comment: null, created_at: new Date("2024-01-01") },
        { id: "h2", instance_id: "inst-1", node_id: "n2", task_id: "t1",
          operator_id: "u2", action: "approve", comment: "同意", created_at: new Date("2024-01-02") },
      ]);
      const history = await service.getHistory("inst-1");
      expect(history.length).toBe(2);
      expect(history[0]!.action).toBe("start");
      expect(history[1]!.action).toBe("approve");
    });
  });
});

// === 补充测试 ===

describe("InstanceService — additional edge cases", () => {
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let db: ReturnType<typeof createMockDatabase>["db"];
  let service: ReturnType<typeof createInstanceService>;

  const startNode = { id: "n-start", definition_id: "def-1", name: "开始", type: "start", config: null, position_x: 0, position_y: 0, sort: 0 };
  const approveNode = { id: "n-approve", definition_id: "def-1", name: "审批", type: "approve",
    config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["user-1"] } },
    position_x: 200, position_y: 0, sort: 1 };
  const endNode = { id: "n-end", definition_id: "def-1", name: "结束", type: "end", config: null, position_x: 400, position_y: 0, sort: 2 };
  const edge1 = { id: "e1", source_node_id: "n-start", target_node_id: "n-approve", name: null, sort: 0 };
  const edge2 = { id: "e2", source_node_id: "n-approve", target_node_id: "n-end", name: null, sort: 1 };

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ calls, results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
    const assigneeResolver = createAssigneeResolver({ db });
    service = createInstanceService({ db, assigneeResolver });
  });

  describe("cancel", () => {
    it("should throw when instance not found", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", []);
      await expect(service.cancel("nonexistent", "admin")).rejects.toThrow("实例不存在");
    });

    it("should throw when instance not running", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", status: InstanceStatus.COMPLETED,
      }]);
      await expect(service.cancel("inst-1", "admin")).rejects.toThrow("实例不在进行中");
    });

    it("should void pending tasks on cancel", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", status: InstanceStatus.RUNNING,
      }]);
      await service.cancel("inst-1", "admin", "管理员终止");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status"))).toBe(true);
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });
  });

  describe("withdraw", () => {
    it("should throw when instance not found", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", []);
      await expect(service.withdraw("nonexistent", "u1")).rejects.toThrow("实例不存在");
    });

    it("should succeed with empty task list", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", initiator_id: "u1", status: InstanceStatus.RUNNING,
      }]);
      results.set("SELECT * FROM sys_workflow_task WHERE instance_id", []);
      await service.withdraw("inst-1", "u1");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET"))).toBe(true);
    });
  });

  describe("resubmit", () => {
    it("should allow resubmit from withdrawn instance", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", definition_id: "def-1", business_type: null,
        business_id: null, title: "请假", status: InstanceStatus.WITHDRAWN, initiator_id: "u1",
      }]);
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [{ id: "def-1", version: 1, status: 1 }]);
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [startNode, approveNode, endNode]);
      results.set("SELECT * FROM sys_workflow_edge WHERE definition_id", [edge1, edge2]);
      const result = await service.resubmit("inst-1", "u1", { days: 3 });
      expect(result.instanceId).toBeTruthy();
    });
  });
});
