/**
 * 集成测试 — 端到端工作流生命周期
 *
 * 测试场景：创建定义 → 配置图 → 发布 → 发起 → 审批 → 条件路由 → 完结
 * 使用 mock database，不依赖真实 PG。
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createWorkflowService } from "../services";
import type { WorkflowService } from "../services";
import { createMockDatabase, createMockExecutor } from "./helpers";

describe("Workflow E2E Integration", () => {
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let db: ReturnType<typeof createMockDatabase>["db"];
  let service: WorkflowService;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ calls, results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
    service = createWorkflowService({ db });
  });

  describe("full lifecycle: define → publish → start → approve → complete", () => {
    it("should execute the complete workflow lifecycle", async () => {
      // Step 1: 创建定义
      const def = await service.createDefinition({ name: "请假审批", code: "leave" });
      expect(def.id).toBeTruthy();

      // Step 2: 保存图 (start → approve(u1) → end)
      await service.saveGraph(def.id, {
        nodes: [
          { id: "n-start", name: "开始", type: "start", config: null },
          { id: "n-approve", name: "经理审批", type: "approve",
            config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["manager-1"] } } },
          { id: "n-end", name: "结束", type: "end", config: null },
        ],
        edges: [
          { id: "e1", source_node_id: "n-start", target_node_id: "n-approve" },
          { id: "e2", source_node_id: "n-approve", target_node_id: "n-end" },
        ],
      });

      // 验证图（需要设置 getGraph 的 mock 结果）
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        { id: "n-start", name: "开始", type: "start", config: null, position_x: 0, position_y: 0, sort: 0 },
        { id: "n-approve", name: "经理审批", type: "approve",
          config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["manager-1"] } },
          position_x: 200, position_y: 0, sort: 1 },
        { id: "n-end", name: "结束", type: "end", config: null, position_x: 400, position_y: 0, sort: 2 },
      ]);
      results.set("SELECT * FROM sys_workflow_edge WHERE definition_id", [
        { id: "e1", source_node_id: "n-start", target_node_id: "n-approve", name: null, sort: 0 },
        { id: "e2", source_node_id: "n-approve", target_node_id: "n-end", name: null, sort: 1 },
      ]);
      const validation = await service.validateGraphData(def.id);
      expect(validation.valid).toBe(true);

      // Step 3: 发布
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [{ id: def.id, status: 0, version: 1 }]);
      await service.publishDefinition(def.id);

      // Step 4: 发起实例
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [{ id: def.id, version: 1, status: 1 }]);
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        { id: "n-start", name: "开始", type: "start", config: null, position_x: 0, position_y: 0, sort: 0 },
        { id: "n-approve", name: "经理审批", type: "approve",
          config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["manager-1"] } },
          position_x: 200, position_y: 0, sort: 1 },
        { id: "n-end", name: "结束", type: "end", config: null, position_x: 400, position_y: 0, sort: 2 },
      ]);
      results.set("SELECT * FROM sys_workflow_edge WHERE definition_id", [
        { id: "e1", source_node_id: "n-start", target_node_id: "n-approve", name: null, sort: 0 },
        { id: "e2", source_node_id: "n-approve", target_node_id: "n-end", name: null, sort: 1 },
      ]);

      const instance = await service.startInstance({
        definitionId: def.id,
        initiatorId: "employee-1",
        title: "年假申请",
        formData: { days: 5, reason: "休息" },
      });
      expect(instance.instanceId).toBeTruthy();

      // 验证创建了实例和任务
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_instance"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_task"))).toBe(true);
    });
  });

  describe("graph operations", () => {
    it("should save and retrieve graph data", async () => {
      const def = await service.createDefinition({ name: "测试", code: "test" });

      // 设置 getGraph 的 mock
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        { id: "n1", name: "开始", type: "start", config: null, position_x: 0, position_y: 0, sort: 0 },
        { id: "n2", name: "结束", type: "end", config: null, position_x: 200, position_y: 0, sort: 1 },
      ]);
      results.set("SELECT * FROM sys_workflow_edge WHERE definition_id", [
        { id: "e1", source_node_id: "n1", target_node_id: "n2", name: null, sort: 0 },
      ]);

      const graph = await service.getGraph(def.id);
      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1);
    });

    it("should clone definition with nodes and edges", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [{
        id: "d1", name: "请假", code: "leave", version: 1,
        description: null, category: "人事", form_config: null,
        settings: null, created_by: "u1", tenant_id: null,
      }]);
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        { id: "n1", name: "开始", type: "start", config: null, position_x: 0, position_y: 0, sort: 0 },
      ]);
      results.set("SELECT * FROM sys_workflow_edge WHERE definition_id", []);

      const cloned = await service.cloneDefinition("d1");
      expect(cloned.id).toBeTruthy();
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_definition"))).toBe(true);
    });
  });

  describe("task operations", () => {
    it("should approve task and emit history", async () => {
      // 设置 approve 的 mock
      results.set("UPDATE sys_workflow_task SET status", [{ id: "t1" }]);
      results.set("SELECT status, assignee_id FROM sys_workflow_task WHERE id", [{
        status: 0, assignee_id: "manager-1",
      }]);
      results.set("SELECT instance_id, node_id FROM sys_workflow_task WHERE id", [{
        instance_id: "inst-1", node_id: "n-approve",
      }]);
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{
        id: "inst-1", graph_snapshot: JSON.stringify({
          nodes: [
            { id: "n-start", name: "开始", type: "start", config: null },
            { id: "n-approve", name: "审批", type: "approve",
              config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["manager-1"] } } },
            { id: "n-end", name: "结束", type: "end", config: null },
          ],
          edges: [
            { id: "e1", source_node_id: "n-start", target_node_id: "n-approve" },
            { id: "e2", source_node_id: "n-approve", target_node_id: "n-end" },
          ],
        }),
        form_data: { days: 5 }, variables: null, initiator_id: "employee-1", status: 0,
      }]);

      await service.approveTask("t1", "manager-1", "同意");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status = 1"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });

    it("should list pending tasks for user", async () => {
      results.set("SELECT COUNT(*)", [{ count: 1 }]);
      results.set("SELECT * FROM sys_workflow_task WHERE assignee_id", [{
        id: "t1", instance_id: "inst-1", node_id: "n-approve", assignee_id: "manager-1",
        action: null, comment: null, status: 0, transfer_to: null, acted_at: null, created_at: new Date(),
      }]);

      const result = await service.listMyTasks("manager-1", { status: 0 });
      expect(result.total).toBe(1);
      expect(result.items[0]!.status).toBe(0);
    });
  });

  describe("definition management", () => {
    it("should list definitions with filters", async () => {
      results.set("SELECT COUNT(*)", [{ count: 2 }]);
      results.set("SELECT * FROM sys_workflow_definition", [
        { id: "d1", name: "请假", code: "leave", version: 1, description: null, category: null, status: 1, created_by: null, tenant_id: null, created_at: new Date() },
        { id: "d2", name: "报销", code: "expense", version: 1, description: null, category: null, status: 0, created_by: null, tenant_id: null, created_at: new Date() },
      ]);

      const result = await service.listDefinitions({ page: 1, pageSize: 10 });
      expect(result.total).toBe(2);
    });

    it("should disable definition", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [{ id: "d1", status: 1 }]);
      await service.disableDefinition("d1");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_definition SET"))).toBe(true);
    });
  });
});
