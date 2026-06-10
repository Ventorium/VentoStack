/**
 * services/definition.ts 测试
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createDefinitionService } from "../../services/definition";
import { createMockDatabase, createMockExecutor } from "../helpers";

describe("DefinitionService", () => {
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let service: ReturnType<typeof createDefinitionService>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ calls, results } = mockExec);
    const { db } = createMockDatabase(mockExec);
    service = createDefinitionService({ db });
  });

  describe("create", () => {
    it("should insert definition", async () => {
      const result = await service.create({ name: "请假审批", code: "leave" });
      expect(result.id).toBeTruthy();
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_definition"))).toBe(true);
    });

    it("should support category", async () => {
      await service.create({ name: "报销", code: "expense", category: "财务" });
      expect(calls[0]!.params).toContain("财务");
    });
  });

  describe("update", () => {
    it("should update fields", async () => {
      await service.update("def-1", { name: "Updated" });
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_definition"))).toBe(true);
    });

    it("should skip when no fields", async () => {
      await service.update("def-1", {});
      expect(calls.length).toBe(0);
    });
  });

  describe("getById", () => {
    it("should return null when not found", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", []);
      const def = await service.getById("nonexistent");
      expect(def).toBeNull();
    });

    it("should return definition", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [
        { id: "d1", name: "请假", code: "leave", version: 1, description: null, category: null, status: 1, created_by: null, tenant_id: null, created_at: new Date("2024-01-01") },
      ]);
      const def = await service.getById("d1");
      expect(def).not.toBeNull();
      expect(def!.name).toBe("请假");
      expect(def!.code).toBe("leave");
    });
  });

  describe("list", () => {
    it("should list with pagination", async () => {
      results.set("SELECT COUNT(*)", [{ total: 1 }]);
      results.set("SELECT * FROM sys_workflow_definition", [
        { id: "d1", name: "请假", code: "leave", version: 1, description: null, category: null, status: 1, created_by: null, tenant_id: null, created_at: new Date("2024-01-01") },
      ]);
      const result = await service.list({ page: 1, pageSize: 10 });
      expect(result.total).toBe(1);
      expect(result.items[0]!.code).toBe("leave");
    });

    it("should filter by status", async () => {
      results.set("SELECT COUNT(*)", [{ total: 0 }]);
      await service.list({ status: 1 });
      expect(calls.some((c) => c.text.includes("status"))).toBe(true);
    });
  });

  describe("publish", () => {
    it("should throw when not found", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", []);
      await expect(service.publish("nonexistent")).rejects.toThrow("流程定义不存在");
    });
  });

  describe("delete", () => {
    it("should throw when not draft", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [
        { id: "d1", status: 1 },
      ]);
      await expect(service.delete("d1")).rejects.toThrow("只有草稿状态");
    });
  });

  describe("clone", () => {
    it("should throw when not found", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", []);
      await expect(service.clone("nonexistent")).rejects.toThrow("流程定义不存在");
    });
  });

  describe("saveGraph", () => {
    it("should delete old and insert new nodes/edges", async () => {
      await service.saveGraph("d1", {
        nodes: [{ id: "n1", name: "开始", type: "start", config: null }],
        edges: [{ id: "e1", source_node_id: "n1", target_node_id: "n2" }],
      });
      expect(calls.some((c) => c.text.includes("DELETE FROM sys_workflow_node"))).toBe(true);
      expect(calls.some((c) => c.text.includes("DELETE FROM sys_workflow_edge"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_node"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_edge"))).toBe(true);
    });
  });

  describe("getGraph", () => {
    it("should return nodes and edges", async () => {
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        { id: "n1", definition_id: "d1", name: "开始", type: "start", config: null, position_x: 0, position_y: 0, sort: 0 },
      ]);
      results.set("SELECT * FROM sys_workflow_edge WHERE definition_id", []);
      const graph = await service.getGraph("d1");
      expect(graph.nodes.length).toBe(1);
      expect(graph.nodes[0]!.id).toBe("n1");
    });
  });

  describe("validateGraphData", () => {
    it("should return valid for correct graph", async () => {
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", [
        { id: "n1", name: "开始", type: "start", config: null, position_x: 0, position_y: 0, sort: 0 },
        { id: "n2", name: "结束", type: "end", config: null, position_x: 200, position_y: 0, sort: 1 },
      ]);
      results.set("SELECT * FROM sys_workflow_edge WHERE definition_id", [
        { id: "e1", source_node_id: "n1", target_node_id: "n2", name: null, sort: 0 },
      ]);
      const result = await service.validateGraphData("d1");
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("should return invalid when no nodes", async () => {
      results.set("SELECT * FROM sys_workflow_node WHERE definition_id", []);
      results.set("SELECT * FROM sys_workflow_edge WHERE definition_id", []);
      const result = await service.validateGraphData("d1");
      expect(result.valid).toBe(false);
    });
  });
});

// === 补充测试 ===

describe("DefinitionService — additional", () => {
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let service: ReturnType<typeof createDefinitionService>;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ calls, results } = mockExec);
    const { db } = createMockDatabase(mockExec);
    service = createDefinitionService({ db });
  });

  describe("disable", () => {
    it("should throw when not found", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", []);
      await expect(service.disable("nonexistent")).rejects.toThrow("流程定义不存在");
    });

    it("should throw when not active", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [{ id: "d1", status: 0 }]);
      await expect(service.disable("d1")).rejects.toThrow("只有已发布");
    });

    it("should disable active definition", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [{ id: "d1", status: 1 }]);
      await service.disable("d1");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_definition SET"))).toBe(true);
    });
  });

  describe("publish", () => {
    it("should be idempotent — skip if already active", async () => {
      results.set("SELECT * FROM sys_workflow_definition WHERE id", [{ id: "d1", status: 1, version: 2 }]);
      await service.publish("d1");
      // 不应执行 UPDATE（因为已经 active）
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_definition SET"))).toBe(false);
    });
  });
});
