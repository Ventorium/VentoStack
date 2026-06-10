/**
 * services/task.ts 测试
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createTaskService } from "../../services/task";
import { createMockDatabase, createMockExecutor } from "../helpers";
import { createAssigneeResolver } from "../../engine/assignee";

// 图快照：start → approve(u1, u2) → end
const snapshot = JSON.stringify({
  nodes: [
    { id: "n-start", name: "开始", type: "start", config: null, position_x: 0, position_y: 0, sort: 0 },
    { id: "n-approve", name: "审批", type: "approve",
      config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["user-1", "user-2"] } },
      position_x: 200, position_y: 0, sort: 1 },
    { id: "n-end", name: "结束", type: "end", config: null, position_x: 400, position_y: 0, sort: 2 },
  ],
  edges: [
    { id: "e1", source_node_id: "n-start", target_node_id: "n-approve", name: null, sort: 0 },
    { id: "e2", source_node_id: "n-approve", target_node_id: "n-end", name: null, sort: 1 },
  ],
});

const counterSignSnapshot = JSON.stringify({
  nodes: [
    { id: "n-start", name: "开始", type: "start", config: null, sort: 0 },
    { id: "n-approve", name: "审批", type: "approve",
      config: { strategy: "sequential", counterSign: true, assignee: { mode: "fixed", userIds: ["user-1"] } },
      sort: 1 },
    { id: "n-end", name: "结束", type: "end", config: null, sort: 2 },
  ],
  edges: [
    { id: "e1", source_node_id: "n-start", target_node_id: "n-approve", sort: 0 },
    { id: "e2", source_node_id: "n-approve", target_node_id: "n-end", sort: 1 },
  ],
});

function setupApproveMocks(results: Map<string, unknown[]>) {
  results.set("UPDATE sys_workflow_task SET status", [{ id: "t1" }]);
  results.set("SELECT status, assignee_id FROM sys_workflow_task WHERE id", [{
    status: 0, assignee_id: "user-1",
  }]);
  results.set("SELECT instance_id, node_id FROM sys_workflow_task WHERE id", [{
    instance_id: "inst-1", node_id: "n-approve",
  }]);
  results.set("SELECT * FROM sys_workflow_task WHERE instance_id", [
    { id: "t1", assignee_id: "user-1", status: 1 },
  ]);
  results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
    id: "inst-1", definition_id: "def-1", initiator_id: "u1", status: 0, graph_snapshot: snapshot,
  }]);
}

describe("TaskService", () => {
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let db: ReturnType<typeof createMockDatabase>["db"];
  let service: ReturnType<typeof createTaskService>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ calls, results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
    const assigneeResolver = createAssigneeResolver({ db });
    service = createTaskService({ db, assigneeResolver });
  });

  describe("approve", () => {
    it("should approve and process node completion", async () => {
      setupApproveMocks(results);
      await service.approve("t1", "user-1", "同意");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status = 1"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });

    it("should throw when task not found", async () => {
      results.set("UPDATE sys_workflow_task SET status", []);
      results.set("SELECT status, assignee_id FROM sys_workflow_task WHERE id", []);
      await expect(service.approve("nonexistent", "user-1")).rejects.toThrow("任务不存在");
    });

    it("should throw when task already acted", async () => {
      results.set("UPDATE sys_workflow_task SET status", []);
      results.set("SELECT status, assignee_id FROM sys_workflow_task WHERE id", [{
        status: 1, assignee_id: "user-1",
      }]);
      await expect(service.approve("t1", "user-1")).rejects.toThrow("任务已处理");
    });

    it("should throw when not assignee", async () => {
      results.set("UPDATE sys_workflow_task SET status", []);
      results.set("SELECT status, assignee_id FROM sys_workflow_task WHERE id", [{
        status: 0, assignee_id: "user-1",
      }]);
      await expect(service.approve("t1", "user-2")).rejects.toThrow("非当前审批人");
    });
  });

  describe("reject", () => {
    it("should reject task and process node completion", async () => {
      setupApproveMocks(results);
      await service.reject("t1", "user-1", "不同意");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status = 2"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });

    it("should throw when task not found", async () => {
      results.set("UPDATE sys_workflow_task SET status", []);
      results.set("SELECT status, assignee_id FROM sys_workflow_task WHERE id", []);
      await expect(service.reject("nonexistent", "user-1")).rejects.toThrow("任务不存在");
    });
  });

  describe("transfer", () => {
    it("should transfer task to another user", async () => {
      results.set("UPDATE sys_workflow_task SET status", [{ id: "t1" }]);
      results.set("SELECT instance_id, node_id FROM sys_workflow_task WHERE id", [{
        instance_id: "inst-1", node_id: "n-approve",
      }]);
      await service.transfer("t1", "user-1", "user-3", "转办");
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_task"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });

    it("should throw when task not found", async () => {
      results.set("UPDATE sys_workflow_task SET status", []);
      await expect(service.transfer("nonexistent", "user-1", "user-3")).rejects.toThrow();
    });
  });

  describe("addSign", () => {
    it("should add signers when counterSign enabled", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", graph_snapshot: counterSignSnapshot,
      }]);
      results.set("SELECT instance_id, node_id, status, assignee_id FROM sys_workflow_task WHERE id", [{
        instance_id: "inst-1", node_id: "n-approve", status: 0, assignee_id: "user-1",
      }]);
      await service.addSign("t1", "user-1", ["user-3", "user-4"], "加签");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status = 1"))).toBe(true);
      const insertTaskCalls = calls.filter((c) => c.text.includes("INSERT INTO sys_workflow_task"));
      expect(insertTaskCalls.length).toBe(2);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });

    it("should throw when counterSign disabled", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", graph_snapshot: snapshot,
      }]);
      results.set("SELECT instance_id, node_id, status, assignee_id FROM sys_workflow_task WHERE id", [{
        instance_id: "inst-1", node_id: "n-approve", status: 0, assignee_id: "user-1",
      }]);
      await expect(service.addSign("t1", "user-1", ["user-3"])).rejects.toThrow("不允许加签");
    });

    it("should throw when task not found", async () => {
      results.set("SELECT instance_id, node_id, status, assignee_id FROM sys_workflow_task WHERE id", []);
      await expect(service.addSign("nonexistent", "user-1", ["user-3"])).rejects.toThrow("任务不存在");
    });

    it("should throw when task already acted", async () => {
      results.set("SELECT instance_id, node_id, status, assignee_id FROM sys_workflow_task WHERE id", [{
        instance_id: "inst-1", node_id: "n-approve", status: 1, assignee_id: "user-1",
      }]);
      await expect(service.addSign("t1", "user-1", ["user-3"])).rejects.toThrow("任务已处理");
    });

    it("should throw when not assignee", async () => {
      results.set("SELECT instance_id, node_id, status, assignee_id FROM sys_workflow_task WHERE id", [{
        instance_id: "inst-1", node_id: "n-approve", status: 0, assignee_id: "user-1",
      }]);
      await expect(service.addSign("t1", "user-2", ["user-3"])).rejects.toThrow("非当前审批人");
    });
  });

  describe("urge", () => {
    it("should emit urge event for pending task", async () => {
      results.set("SELECT instance_id, assignee_id FROM sys_workflow_task WHERE id", [{
        instance_id: "inst-1", assignee_id: "user-1",
      }]);
      await service.urge("t1", "user-2");
    });

    it("should throw when task not found", async () => {
      results.set("SELECT instance_id, assignee_id FROM sys_workflow_task WHERE id", []);
      await expect(service.urge("nonexistent", "user-1")).rejects.toThrow("任务不存在");
    });
  });

  describe("listMy", () => {
    it("should list tasks with pagination", async () => {
      results.set("SELECT COUNT(*)", [{ count: 2 }]);
      results.set("SELECT * FROM sys_workflow_task WHERE assignee_id", [
        { id: "t1", instance_id: "inst-1", node_id: "n-approve", assignee_id: "user-1",
          action: null, comment: null, status: 0, transfer_to: null, acted_at: null, created_at: new Date() },
        { id: "t2", instance_id: "inst-2", node_id: "n-approve", assignee_id: "user-1",
          action: "approve", comment: "OK", status: 1, transfer_to: null, acted_at: new Date(), created_at: new Date() },
      ]);
      const result = await service.listMy("user-1", { page: 1, pageSize: 10 });
      expect(result.total).toBe(2);
      expect(result.items.length).toBe(2);
      expect(result.items[0]!.status).toBe(0);
    });

    it("should filter by status", async () => {
      results.set("SELECT COUNT(*)", [{ count: 1 }]);
      results.set("SELECT * FROM sys_workflow_task WHERE assignee_id", [
        { id: "t1", instance_id: "inst-1", node_id: "n1", assignee_id: "user-1",
          action: null, comment: null, status: 0, transfer_to: null, acted_at: null, created_at: new Date() },
      ]);
      const result = await service.listMy("user-1", { status: 0 });
      expect(result.total).toBe(1);
    });
  });

  describe("listMyDone", () => {
    it("should list completed tasks", async () => {
      results.set("SELECT COUNT(*)", [{ count: 1 }]);
      results.set("SELECT * FROM sys_workflow_task WHERE assignee_id", [
        { id: "t1", instance_id: "inst-1", node_id: "n1", assignee_id: "user-1",
          action: "approve", comment: "OK", status: 1, transfer_to: null, acted_at: new Date(), created_at: new Date() },
      ]);
      const result = await service.listMyDone("user-1", { page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.items[0]!.action).toBe("approve");
    });
  });
});

// === 补充测试 ===

describe("TaskService — additional edge cases", () => {
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let db: ReturnType<typeof createMockDatabase>["db"];
  let service: ReturnType<typeof createTaskService>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ calls, results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
    const assigneeResolver = createAssigneeResolver({ db });
    service = createTaskService({ db, assigneeResolver });
  });

  describe("transfer — error distinction", () => {
    it("should throw taskAlreadyActed when task already processed", async () => {
      results.set("UPDATE sys_workflow_task SET status", []);
      results.set("SELECT status, assignee_id FROM sys_workflow_task WHERE id", [{
        status: 1, assignee_id: "user-1",
      }]);
      await expect(service.transfer("t1", "user-1", "user-3")).rejects.toThrow("任务已处理");
    });

    it("should throw notAssignee when not the assignee", async () => {
      results.set("UPDATE sys_workflow_task SET status", []);
      results.set("SELECT status, assignee_id FROM sys_workflow_task WHERE id", [{
        status: 0, assignee_id: "user-1",
      }]);
      await expect(service.transfer("t1", "user-2", "user-3")).rejects.toThrow("非当前审批人");
    });
  });

  describe("addSign — empty targetUserIds", () => {
    it("should still mark current task as approved", async () => {
      const counterSignSnapshot = JSON.stringify({
        nodes: [
          { id: "n-start", name: "开始", type: "start", config: null, sort: 0 },
          { id: "n-approve", name: "审批", type: "approve",
            config: { strategy: "sequential", counterSign: true, assignee: { mode: "fixed", userIds: ["user-1"] } }, sort: 1 },
          { id: "n-end", name: "结束", type: "end", config: null, sort: 2 },
        ],
        edges: [
          { id: "e1", source_node_id: "n-start", target_node_id: "n-approve", sort: 0 },
          { id: "e2", source_node_id: "n-approve", target_node_id: "n-end", sort: 1 },
        ],
      });
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", graph_snapshot: counterSignSnapshot,
      }]);
      results.set("SELECT instance_id, node_id, status, assignee_id FROM sys_workflow_task WHERE id", [{
        instance_id: "inst-1", node_id: "n-approve", status: 0, assignee_id: "user-1",
      }]);
      await service.addSign("t1", "user-1", [], "加签");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status = 1"))).toBe(true);
      // 没有新任务插入
      const insertCalls = calls.filter((c) => c.text.includes("INSERT INTO sys_workflow_task"));
      expect(insertCalls.length).toBe(0);
    });
  });

  describe("listMy", () => {
    it("should handle empty results", async () => {
      results.set("SELECT COUNT(*)", [{ count: 0 }]);
      results.set("SELECT * FROM sys_workflow_task WHERE assignee_id", []);
      const result = await service.listMy("user-1");
      expect(result.total).toBe(0);
      expect(result.items.length).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });

    it("should use default pagination", async () => {
      results.set("SELECT COUNT(*)", [{ count: 0 }]);
      results.set("SELECT * FROM sys_workflow_task WHERE assignee_id", []);
      const result = await service.listMy("user-1");
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(10);
    });
  });

  describe("listMyDone", () => {
    it("should handle empty results", async () => {
      results.set("SELECT COUNT(*)", [{ count: 0 }]);
      results.set("SELECT * FROM sys_workflow_task WHERE assignee_id", []);
      const result = await service.listMyDone("user-1");
      expect(result.total).toBe(0);
      expect(result.items.length).toBe(0);
    });
  });
});

// === 补充测试：transfer 自转办 ===

describe("TaskService — transfer self", () => {
  let results: ReturnType<typeof createMockExecutor>["results"];
  let db: ReturnType<typeof createMockDatabase>["db"];
  let service: ReturnType<typeof createTaskService>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
    const assigneeResolver = createAssigneeResolver({ db });
    service = createTaskService({ db, assigneeResolver });
  });

  it("should throw when transferring to self", async () => {
    await expect(service.transfer("t1", "user-1", "user-1")).rejects.toThrow();
  });
});
