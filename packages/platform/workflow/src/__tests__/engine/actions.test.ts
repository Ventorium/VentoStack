/**
 * engine/actions.ts 测试 — 流程控制函数直接测试
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  insertHistory, completeInstance, createTasksForNode,
  advanceFromNode, processNodeCompletion, handleNodeReject,
} from "../../engine/actions";
import type { FlowActionDeps } from "../../engine/actions";
import type { GraphNodeData, GraphEdgeData, EngineContext, WorkflowGraph } from "../../engine/graph";
import { buildGraph } from "../../engine/graph";
import type { AssigneeResolver } from "../../engine/assignee";
import { createMockDatabase, createMockExecutor } from "../helpers";

// 简单图：start → approve(u1) → end
const simpleNodes: GraphNodeData[] = [
  { id: "n-start", name: "开始", type: "start", config: null },
  { id: "n-approve", name: "审批", type: "approve",
    config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["u1"] } } },
  { id: "n-end", name: "结束", type: "end", config: null },
];
const simpleEdges: GraphEdgeData[] = [
  { id: "e1", source_node_id: "n-start", target_node_id: "n-approve" },
  { id: "e2", source_node_id: "n-approve", target_node_id: "n-end" },
];

// 并行图：start → approve(parallel_and, u1,u2) → end
const parallelNodes: GraphNodeData[] = [
  { id: "n-start", name: "开始", type: "start", config: null },
  { id: "n-approve", name: "会签", type: "approve",
    config: { strategy: "parallel_and", assignee: { mode: "fixed", userIds: ["u1", "u2"] } } },
  { id: "n-end", name: "结束", type: "end", config: null },
];

// CC 图：start → cc → approve → end
const ccNodes: GraphNodeData[] = [
  { id: "n-start", name: "开始", type: "start", config: null },
  { id: "n-cc", name: "抄送", type: "cc", config: null },
  { id: "n-approve", name: "审批", type: "approve",
    config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["u1"] } } },
  { id: "n-end", name: "结束", type: "end", config: null },
];
const ccEdges: GraphEdgeData[] = [
  { id: "e1", source_node_id: "n-start", target_node_id: "n-cc" },
  { id: "e2", source_node_id: "n-cc", target_node_id: "n-approve" },
  { id: "e3", source_node_id: "n-approve", target_node_id: "n-end" },
];

// 条件图：start → condition(days>3 → long, default → short) → end
const condNodes: GraphNodeData[] = [
  { id: "n-start", name: "开始", type: "start", config: null },
  { id: "n-cond", name: "条件", type: "condition",
    config: { conditions: [{ field: "formData.days", operator: ">", value: 3, targetNodeId: "n-long" }], defaultNodeId: "n-short" } },
  { id: "n-long", name: "长假", type: "approve",
    config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["u-long"] } } },
  { id: "n-short", name: "短假", type: "approve",
    config: { strategy: "sequential", assignee: { mode: "fixed", userIds: ["u-short"] } } },
  { id: "n-end", name: "结束", type: "end", config: null },
];
const condEdges: GraphEdgeData[] = [
  { id: "e1", source_node_id: "n-start", target_node_id: "n-cond" },
  { id: "e2", source_node_id: "n-cond", target_node_id: "n-long" },
  { id: "e3", source_node_id: "n-cond", target_node_id: "n-short" },
  { id: "e4", source_node_id: "n-long", target_node_id: "n-end" },
  { id: "e5", source_node_id: "n-short", target_node_id: "n-end" },
];

function makeCtx(overrides?: Partial<EngineContext>): EngineContext {
  return {
    instanceId: "inst-1", formData: { days: 5 }, variables: {},
    initiator: { id: "u1" }, operatorId: "u1", ...overrides,
  };
}

describe("actions.ts", () => {
  let calls: ReturnType<typeof createMockExecutor>["calls"];
  let results: ReturnType<typeof createMockExecutor>["results"];
  let db: ReturnType<typeof createMockDatabase>["db"];
  let deps: FlowActionDeps;
  let mockAssigneeResolver: AssigneeResolver;

  beforeEach(() => {
    const mockExec = createMockExecutor();
    ({ calls, results } = mockExec);
    ({ db } = createMockDatabase(mockExec));
    mockAssigneeResolver = { resolve: async (node, _ctx) => {
      const cfg = node.config as any;
      return cfg?.assignee?.userIds ?? [];
    }};
    deps = { db, assigneeResolver: mockAssigneeResolver };
  });

  describe("insertHistory", () => {
    it("should insert history record", async () => {
      await insertHistory(db, "inst-1", "n1", "t1", "u1", "approve", "同意");
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });
  });

  describe("completeInstance", () => {
    it("should update instance status and insert history", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{ id: "inst-1", status: 0 }]);
      await completeInstance(db, "inst-1", "u1");
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET"))).toBe(true);
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });

    it("should emit event when eventBus provided", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{ id: "inst-1", status: 0 }]);
      let emitted: any = null;
      const eventBus = { emit: (_e: string, d: any) => { emitted = d; } } as any;
      await completeInstance(db, "inst-1", "u1", eventBus);
      expect(emitted).toEqual({ instanceId: "inst-1" });
    });

    it("should be idempotent — skip if not RUNNING", async () => {
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{ id: "inst-1", status: 1 }]); // COMPLETED
      await completeInstance(db, "inst-1", "u1");
      // 不应执行 UPDATE
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET"))).toBe(false);
    });
  });

  describe("createTasksForNode", () => {
    it("should create single task for sequential strategy", async () => {
      const graph = buildGraph(simpleNodes, simpleEdges);
      const node = graph.nodes.get("n-approve")!;
      await createTasksForNode(deps, db, "inst-1", node, makeCtx());
      const insertCalls = calls.filter((c) => c.text.includes("INSERT INTO sys_workflow_task"));
      expect(insertCalls.length).toBe(1);
    });

    it("should create multiple tasks for parallel strategy", async () => {
      const graph = buildGraph(parallelNodes, simpleEdges);
      const node = graph.nodes.get("n-approve")!;
      await createTasksForNode(deps, db, "inst-1", node, makeCtx());
      const insertCalls = calls.filter((c) => c.text.includes("INSERT INTO sys_workflow_task"));
      expect(insertCalls.length).toBe(2);
    });

    it("should skip when onEmptyAssignee=skip", async () => {
      const node = { id: "n1", name: "空", type: "approve" as const,
        config: { onEmptyAssignee: "skip", assignee: { mode: "fixed", userIds: [] } },
        outgoingEdges: [], incomingEdges: [] };
      await createTasksForNode(deps, db, "inst-1", node, makeCtx());
      expect(calls.filter((c) => c.text.includes("INSERT INTO sys_workflow_task")).length).toBe(0);
    });

    it("should throw when no assignees and not skip", async () => {
      const node = { id: "n1", name: "空", type: "approve" as const,
        config: { assignee: { mode: "fixed", userIds: [] } },
        outgoingEdges: [], incomingEdges: [] };
      await expect(createTasksForNode(deps, db, "inst-1", node, makeCtx()))
        .rejects.toThrow("无可用审批人");
    });
  });

  describe("advanceFromNode", () => {
    it("should advance from start to approve node", async () => {
      const graph = buildGraph(simpleNodes, simpleEdges);
      await advanceFromNode(deps, db, "inst-1", graph, graph.startNodeId, makeCtx());
      // 应该创建任务
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_task"))).toBe(true);
      // 应该有 node_entered 和 node_completed 历史
      const histCalls = calls.filter((c) => c.text.includes("INSERT INTO sys_workflow_history"));
      expect(histCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("should complete instance when reaching end node", async () => {
      // 图：start → end（直接到结束）
      const nodes: GraphNodeData[] = [
        { id: "n-start", name: "开始", type: "start", config: null },
        { id: "n-end", name: "结束", type: "end", config: null },
      ];
      const edges: GraphEdgeData[] = [
        { id: "e1", source_node_id: "n-start", target_node_id: "n-end" },
      ];
      const graph = buildGraph(nodes, edges);
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{ id: "inst-1", status: 0 }]);
      await advanceFromNode(deps, db, "inst-1", graph, graph.startNodeId, makeCtx());
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET"))).toBe(true);
      // end节点应有 node_completed 历史
      expect(calls.some((c) => c.params?.includes("node_completed"))).toBe(true);
    });

    it("should handle cc node (skip through)", async () => {
      const graph = buildGraph(ccNodes, ccEdges);
      await advanceFromNode(deps, db, "inst-1", graph, graph.startNodeId, makeCtx());
      // CC 节点直接跳过，最终创建 approve 任务
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_task"))).toBe(true);
    });

    it("should handle condition node routing", async () => {
      const graph = buildGraph(condNodes, condEdges);
      // days=5 > 3 → 走 n-long
      await advanceFromNode(deps, db, "inst-1", graph, graph.startNodeId, makeCtx({ formData: { days: 5 } }));
      const taskInserts = calls.filter((c) => c.text.includes("INSERT INTO sys_workflow_task"));
      expect(taskInserts.length).toBe(1);
    });

    it("should use default path when no condition matches", async () => {
      const graph = buildGraph(condNodes, condEdges);
      // days=1 <= 3 → 走默认 n-short
      await advanceFromNode(deps, db, "inst-1", graph, graph.startNodeId, makeCtx({ formData: { days: 1 } }));
      const taskInserts = calls.filter((c) => c.text.includes("INSERT INTO sys_workflow_task"));
      expect(taskInserts.length).toBe(1);
    });

    it("should throw when no next node for non-end", async () => {
      const nodes: GraphNodeData[] = [
        { id: "n-start", name: "开始", type: "start", config: null },
        { id: "n-approve", name: "审批", type: "approve", config: null },
      ];
      const edges: GraphEdgeData[] = [
        { id: "e1", source_node_id: "n-start", target_node_id: "n-approve" },
      ];
      const graph = buildGraph(nodes, edges);
      // advanceFromNode 从 approve 节点开始（它没有出边）
      await expect(advanceFromNode(deps, db, "inst-1", graph, "n-approve", makeCtx()))
        .rejects.toThrow("无后续节点");
    });
  });

  describe("handleNodeReject", () => {
    it("terminate — should reject instance", async () => {
      const graph = buildGraph(simpleNodes, simpleEdges);
      await handleNodeReject(deps, db, "inst-1", graph, "n-approve", makeCtx());
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET"))).toBe(true);
      expect(calls.some((c) => c.params?.includes("instance_rejected"))).toBe(true);
    });

    it("return_to_start — should void tasks and re-enter start", async () => {
      const nodes: GraphNodeData[] = [
        { id: "n-start", name: "开始", type: "start", config: null },
        { id: "n-approve", name: "审批", type: "approve",
          config: { rejectAction: "return_to_start", assignee: { mode: "fixed", userIds: ["u1"] } } },
        { id: "n-end", name: "结束", type: "end", config: null },
      ];
      const edges: GraphEdgeData[] = [
        { id: "e1", source_node_id: "n-start", target_node_id: "n-approve" },
        { id: "e2", source_node_id: "n-approve", target_node_id: "n-end" },
      ];
      const graph = buildGraph(nodes, edges);
      await handleNodeReject(deps, db, "inst-1", graph, "n-approve", makeCtx());
      // 应该作废任务
      expect(calls.some((c) => c.text.includes("FOR UPDATE"))).toBe(true);
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status = 5"))).toBe(true);
    });

    it("return_to_previous — should find previous approve node", async () => {
      const nodes: GraphNodeData[] = [
        { id: "n-start", name: "开始", type: "start", config: null },
        { id: "n-approve1", name: "审批1", type: "approve",
          config: { assignee: { mode: "fixed", userIds: ["u1"] } } },
        { id: "n-approve2", name: "审批2", type: "approve",
          config: { rejectAction: "return_to_previous", assignee: { mode: "fixed", userIds: ["u2"] } } },
        { id: "n-end", name: "结束", type: "end", config: null },
      ];
      const edges: GraphEdgeData[] = [
        { id: "e1", source_node_id: "n-start", target_node_id: "n-approve1" },
        { id: "e2", source_node_id: "n-approve1", target_node_id: "n-approve2" },
        { id: "e3", source_node_id: "n-approve2", target_node_id: "n-end" },
      ];
      const graph = buildGraph(nodes, edges);
      await handleNodeReject(deps, db, "inst-1", graph, "n-approve2", makeCtx());
      // 应该作废当前任务
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_task SET status = 5"))).toBe(true);
      // 应该重新创建审批1的任务
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_task"))).toBe(true);
    });
  });

  describe("processNodeCompletion", () => {
    it("should create next sequential task when not completed", async () => {
      const graph = buildGraph(simpleNodes, simpleEdges);
      // 当前有一个 approved 的任务，还有一个 pending（模拟顺序审批）
      results.set("SELECT * FROM sys_workflow_task WHERE instance_id", [
        { id: "t1", assignee_id: "u1", status: 1 },
      ]);
      await processNodeCompletion(deps, db, "inst-1", graph, "n-approve", makeCtx());
      // 应该创建下一个审批人的任务（因为 sequential 策略，u1 已审批完）
      // 但 assignee 只有 u1，所以应该进入完成流程
      expect(calls.some((c) => c.text.includes("INSERT INTO sys_workflow_history"))).toBe(true);
    });

    it("should advance to next node when all approved", async () => {
      const graph = buildGraph(simpleNodes, simpleEdges);
      results.set("SELECT * FROM sys_workflow_task WHERE instance_id", [
        { id: "t1", assignee_id: "u1", status: 1 },
      ]);
      results.set("SELECT * FROM sys_workflow_instance WHERE id", [{ id: "inst-1", status: 0 }]);
      await processNodeCompletion(deps, db, "inst-1", graph, "n-approve", makeCtx());
      // 节点完成 → 推进到 end → completeInstance → instance_completed
      expect(calls.some((c) => c.params?.includes("instance_completed"))).toBe(true);
    });

    it("should handle rejection via terminate", async () => {
      const graph = buildGraph(simpleNodes, simpleEdges);
      results.set("SELECT * FROM sys_workflow_task WHERE instance_id", [
        { id: "t1", assignee_id: "u1", status: 2 }, // rejected
      ]);
      await processNodeCompletion(deps, db, "inst-1", graph, "n-approve", makeCtx());
      expect(calls.some((c) => c.text.includes("UPDATE sys_workflow_instance SET"))).toBe(true);
    });
  });
});
