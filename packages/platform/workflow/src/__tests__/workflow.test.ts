/**
 * @ventostack/workflow - 工作流服务测试
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { DefStatus, InstanceStatus, TaskStatus, createWorkflowService } from "../services/workflow";
import { createMockDatabase, createMockExecutor } from "./helpers";

describe("WorkflowService", () => {
  let executor: ReturnType<typeof createMockExecutor>["executor"];
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let service: ReturnType<typeof createWorkflowService>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ executor, calls, results } = mockExec);
    const { db } = createMockDatabase(mockExec);
    service = createWorkflowService({ db });
  });

  describe("createDefinition", () => {
    it("should create definition", async () => {
      const result = await service.createDefinition({ name: "请假审批", code: "leave_approval" });

      expect(result.id).toBeTruthy();
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_definition"))).toBe(true);
      expect(calls[0]!.params).toContain("请假审批");
      expect(calls[0]!.params).toContain("leave_approval");
    });

    it("should support description", async () => {
      await service.createDefinition({
        name: "报销",
        code: "expense",
        description: "报销审批流程",
      });

      expect(calls[0]!.params).toContain("报销审批流程");
    });
  });

  describe("updateDefinition", () => {
    it("should update fields", async () => {
      await service.updateDefinition("def-1", { name: "Updated", status: DefStatus.DISABLED });

      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_definition SET"))).toBe(true);
    });

    it("should skip when no fields", async () => {
      await service.updateDefinition("def-1", {});
      expect(calls.length).toBe(0);
    });
  });

  describe("deleteDefinition", () => {
    it("should delete definition and related data", async () => {
      // Set up mock instances so cascade delete triggers task deletion
      results.set("SELECT * FROM sys_workflow_instance WHERE definition_id", [
        { id: "inst-1", definition_id: "def-1" },
      ]);

      await service.deleteDefinition("def-1");

      expect(calls.some((c) => c.text.includes("DELETE FROM sys_workflow_task"))).toBe(true);
      expect(calls.some((c) => c.text.includes("DELETE FROM sys_workflow_instance"))).toBe(true);
      expect(calls.some((c) => c.text.includes("DELETE FROM sys_workflow_node"))).toBe(true);
      expect(calls.some((c) => c.text.includes("DELETE FROM sys_workflow_definition"))).toBe(true);
    });
  });

  describe("getDefinition", () => {
    it("should return null when not found", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", []);

      const def = await service.getDefinition("nonexistent");
      expect(def).toBeNull();
    });

    it("should return definition", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [
        {
          id: "d1",
          name: "请假",
          code: "leave",
          version: 1,
          description: null,
          status: 1,
        },
      ]);

      const def = await service.getDefinition("d1");
      expect(def).not.toBeNull();
      expect(def!.name).toBe("请假");
    });
  });

  describe("listDefinitions", () => {
    it("should list with pagination", async () => {
      results.set("SELECT COUNT(*)", [{ total: 1 }]);
      results.set("SELECT * FROM sys_workflow_definition", [
        { id: "d1", name: "请假", code: "leave", version: 1, description: null, status: 1 },
      ]);

      const result = await service.listDefinitions({ page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.items[0]!.code).toBe("leave");
    });

    it("should filter by status", async () => {
      results.set("SELECT COUNT(*)", [{ total: 0 }]);

      await service.listDefinitions({ status: DefStatus.ACTIVE });
      expect(calls.some((c) => c.text.includes("status = "))).toBe(true);
    });
  });

  describe("setNodes / getNodes", () => {
    it("should set nodes for definition", async () => {
      await service.setNodes("def-1", [
        { name: "开始", type: "start", sort: 0 },
        { name: "经理审批", type: "approve", assigneeType: "role", assigneeId: "mgr", sort: 1 },
        { name: "结束", type: "end", sort: 2 },
      ]);

      // Should delete existing + insert 3 new
      expect(calls.some((c) => c.text.includes("DELETE FROM sys_workflow_node"))).toBe(true);
      const insertCalls = calls.filter((c) => c.text.includes("INSERT INTO sys_workflow_node"));
      expect(insertCalls.length).toBe(3);
    });

    it("should get nodes", async () => {
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        {
          id: "n1",
          definition_id: "d1",
          name: "开始",
          type: "start",
          assignee_type: null,
          assignee_id: null,
          sort: 0,
          config: null,
        },
        {
          id: "n2",
          definition_id: "d1",
          name: "审批",
          type: "approve",
          assignee_type: "user",
          assignee_id: "u1",
          sort: 1,
          config: null,
        },
      ]);

      const nodes = await service.getNodes("d1");
      expect(nodes.length).toBe(2);
      expect(nodes[0]!.type).toBe("start");
    });
  });

  describe("startInstance", () => {
    it("should throw when no nodes", async () => {
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", []);

      await expect(
        service.startInstance({
          definitionId: "d1",
          initiatorId: "u1",
        }),
      ).rejects.toThrow("未定义节点");
    });

    it("should throw when no start node", async () => {
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        {
          id: "n1",
          definition_id: "d1",
          name: "审批",
          type: "approve",
          assignee_type: "user",
          assignee_id: "u1",
          sort: 0,
          config: null,
        },
      ]);

      await expect(
        service.startInstance({
          definitionId: "d1",
          initiatorId: "u1",
        }),
      ).rejects.toThrow("未找到开始节点");
    });

    it("should start instance and create first task", async () => {
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        {
          id: "n1",
          definition_id: "d1",
          name: "开始",
          type: "start",
          assignee_type: null,
          assignee_id: null,
          sort: 0,
          config: null,
        },
        {
          id: "n2",
          definition_id: "d1",
          name: "经理审批",
          type: "approve",
          assignee_type: "user",
          assignee_id: "mgr1",
          sort: 1,
          config: null,
        },
        {
          id: "n3",
          definition_id: "d1",
          name: "结束",
          type: "end",
          assignee_type: null,
          assignee_id: null,
          sort: 2,
          config: null,
        },
      ]);

      const result = await service.startInstance({
        definitionId: "d1",
        initiatorId: "u1",
        businessType: "leave",
        businessId: "leave-1",
      });

      expect(result.instanceId).toBeTruthy();
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_instance"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_task"))).toBe(true);
    });
  });

  describe("approveTask", () => {
    it("should throw when task not found", async () => {
      results.set("SELECT * FROM sys_workflow_task WHERE id", []);

      await expect(service.approveTask("t1", "u1")).rejects.toThrow("任务不存在");
    });

    it("should throw when task already processed", async () => {
      results.set("SELECT * FROM sys_workflow_task WHERE id", [
        {
          id: "t1",
          instance_id: "i1",
          node_id: "n1",
          assignee_id: "u1",
          status: TaskStatus.APPROVED,
        },
      ]);

      await expect(service.approveTask("t1", "u1")).rejects.toThrow("任务已处理");
    });

    it("should approve and advance to next node", async () => {
      results.set("SELECT * FROM sys_workflow_task WHERE id", [
        {
          id: "t1",
          instance_id: "i1",
          node_id: "n2",
          assignee_id: "u1",
          status: TaskStatus.PENDING,
        },
      ]);
      // For advanceInstance
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [
        {
          id: "i1",
          definition_id: "d1",
          status: InstanceStatus.RUNNING,
        },
      ]);
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        { id: "n1", definition_id: "d1", name: "开始", type: "start", sort: 0, assignee_id: null },
        {
          id: "n2",
          definition_id: "d1",
          name: "审批1",
          type: "approve",
          sort: 1,
          assignee_id: "u1",
        },
        {
          id: "n3",
          definition_id: "d1",
          name: "审批2",
          type: "approve",
          sort: 2,
          assignee_id: "u2",
        },
        { id: "n4", definition_id: "d1", name: "结束", type: "end", sort: 3, assignee_id: null },
      ]);

      await service.approveTask("t1", "u1", "同意");

      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status"))).toBe(true);
    });
  });

  describe("rejectTask", () => {
    it("should reject and mark instance rejected", async () => {
      results.set("SELECT * FROM sys_workflow_task WHERE id", [
        {
          id: "t1",
          instance_id: "i1",
          node_id: "n2",
          assignee_id: "u1",
          status: TaskStatus.PENDING,
        },
      ]);

      await service.rejectTask("t1", "u1", "不同意");

      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status"))).toBe(true);
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET status"))).toBe(
        true,
      );
    });
  });

  describe("getMyTasks", () => {
    it("should list tasks for user", async () => {
      results.set("SELECT COUNT(*)", [{ total: 1 }]);
      results.set("SELECT * FROM sys_workflow_task", [
        {
          id: "t1",
          instance_id: "i1",
          node_id: "n1",
          assignee_id: "u1",
          action: null,
          comment: null,
          status: 0,
          acted_at: null,
          created_at: new Date("2024-01-01"),
        },
      ]);

      const result = await service.getMyTasks("u1", { page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.items[0]!.assigneeId).toBe("u1");
    });
  });

  describe("getInstanceDetail", () => {
    it("should return null when not found", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", []);

      const detail = await service.getInstanceDetail("nonexistent");
      expect(detail).toBeNull();
    });

    it("should return instance detail with nodes and tasks", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [
        {
          id: "i1",
          definition_id: "d1",
          business_type: null,
          business_id: null,
          initiator_id: "u1",
          current_node_id: "n2",
          status: 0,
          variables: null,
          created_at: new Date("2024-01-01"),
        },
      ]);
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        {
          id: "n1",
          definition_id: "d1",
          name: "开始",
          type: "start",
          assignee_type: null,
          assignee_id: null,
          sort: 0,
          config: null,
        },
      ]);
      results.set("SELECT * FROM sys_workflow_task WHERE instance_id", [
        {
          id: "t1",
          instance_id: "i1",
          node_id: "n2",
          assignee_id: "u1",
          action: null,
          comment: null,
          status: 0,
          acted_at: null,
          created_at: new Date("2024-01-01"),
        },
      ]);

      const detail = await service.getInstanceDetail("i1");
      expect(detail).not.toBeNull();
      expect(detail!.instance.id).toBe("i1");
      expect(detail!.nodes.length).toBe(1);
      expect(detail!.tasks.length).toBe(1);
    });
  });
});
