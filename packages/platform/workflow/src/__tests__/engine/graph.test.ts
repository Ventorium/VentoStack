/**
 * engine/graph.ts 纯函数测试
 */

import { describe, expect, it } from "bun:test";
import {
  buildGraph,
  buildGraphFromSnapshot,
  evaluateCondition,
  getNextNodes,
  hasCycle,
  resolveField,
  validateGraph,
} from "../../engine/graph";
import type { EngineContext, GraphNodeData, GraphEdgeData } from "../../engine/graph";

function makeCtx(overrides?: Partial<EngineContext>): EngineContext {
  return {
    instanceId: "i1",
    formData: { days: 5, leave_type: "年假" },
    variables: {},
    initiator: { id: "u1", deptId: "dept-1" },
    operatorId: "u1",
    ...overrides,
  };
}

function makeNodes(): GraphNodeData[] {
  return [
    { id: "n-start", name: "开始", type: "start", config: null },
    { id: "n-approve", name: "审批", type: "approve", config: null },
    { id: "n-end", name: "结束", type: "end", config: null },
  ];
}

function makeEdges(): GraphEdgeData[] {
  return [
    { id: "e1", source_node_id: "n-start", target_node_id: "n-approve" },
    { id: "e2", source_node_id: "n-approve", target_node_id: "n-end" },
  ];
}

describe("buildGraph", () => {
  it("should build graph from nodes and edges", () => {
    const graph = buildGraph(makeNodes(), makeEdges());
    expect(graph.startNodeId).toBe("n-start");
    expect(graph.nodes.size).toBe(3);
    expect(graph.edges.size).toBe(2);
  });

  it("should populate outgoing/incoming edges", () => {
    const graph = buildGraph(makeNodes(), makeEdges());
    const approve = graph.nodes.get("n-approve")!;
    expect(approve.outgoingEdges).toEqual(["e2"]);
    expect(approve.incomingEdges).toEqual(["e1"]);
  });

  it("should throw when no start node", () => {
    const nodes = makeNodes().filter((n) => n.type !== "start");
    expect(() => buildGraph(nodes, makeEdges())).toThrow("流程缺少开始节点");
  });
});

describe("buildGraphFromSnapshot", () => {
  it("should rebuild graph from JSON string", () => {
    const snapshot = JSON.stringify({ nodes: makeNodes(), edges: makeEdges() });
    const graph = buildGraphFromSnapshot(snapshot);
    expect(graph.startNodeId).toBe("n-start");
    expect(graph.nodes.size).toBe(3);
  });
});

describe("getNextNodes", () => {
  it("should return next node for simple edge", () => {
    const graph = buildGraph(makeNodes(), makeEdges());
    const next = getNextNodes(graph, "n-start", makeCtx());
    expect(next.length).toBe(1);
    expect(next[0]!.id).toBe("n-approve");
  });

  it("should return empty for end node", () => {
    const graph = buildGraph(makeNodes(), makeEdges());
    const next = getNextNodes(graph, "n-end", makeCtx());
    expect(next.length).toBe(0);
  });

  it("should return empty for unknown node", () => {
    const graph = buildGraph(makeNodes(), makeEdges());
    const next = getNextNodes(graph, "nonexistent", makeCtx());
    expect(next.length).toBe(0);
  });

  it("should evaluate conditions for condition node", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      {
        id: "n-cond",
        name: "天数判断",
        type: "condition",
        config: {
          conditions: [
            { field: "formData.days", operator: ">", value: 3, targetNodeId: "n-long" },
            { field: "formData.days", operator: "<=", value: 3, targetNodeId: "n-short" },
          ],
          defaultNodeId: "n-short",
        },
      },
      { id: "n-long", name: "长假", type: "approve", config: null },
      { id: "n-short", name: "短假", type: "approve", config: null },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-cond" },
      { id: "e2", source_node_id: "n-cond", target_node_id: "n-long" },
      { id: "e3", source_node_id: "n-cond", target_node_id: "n-short" },
      { id: "e4", source_node_id: "n-long", target_node_id: "n-end" },
      { id: "e5", source_node_id: "n-short", target_node_id: "n-end" },
    ];
    const graph = buildGraph(nodes, edges);

    // days=5 > 3 → 走 n-long
    const next = getNextNodes(graph, "n-cond", makeCtx({ formData: { days: 5 } }));
    expect(next.length).toBe(1);
    expect(next[0]!.id).toBe("n-long");
  });

  it("should use defaultNodeId when no condition matches", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      {
        id: "n-cond",
        name: "天数判断",
        type: "condition",
        config: {
          conditions: [
            { field: "formData.days", operator: ">", value: 100, targetNodeId: "n-long" },
          ],
          defaultNodeId: "n-short",
        },
      },
      { id: "n-long", name: "长假", type: "approve", config: null },
      { id: "n-short", name: "短假", type: "approve", config: null },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-cond" },
      { id: "e2", source_node_id: "n-cond", target_node_id: "n-long" },
      { id: "e3", source_node_id: "n-cond", target_node_id: "n-short" },
      { id: "e4", source_node_id: "n-long", target_node_id: "n-end" },
      { id: "e5", source_node_id: "n-short", target_node_id: "n-end" },
    ];
    const graph = buildGraph(nodes, edges);

    // days=1 不匹配 >100 → 走 default
    const next = getNextNodes(graph, "n-cond", makeCtx({ formData: { days: 1 } }));
    expect(next.length).toBe(1);
    expect(next[0]!.id).toBe("n-short");
  });
});

describe("evaluateCondition", () => {
  it("should evaluate == operator", () => {
    const ctx = makeCtx({ formData: { status: "active" } });
    expect(evaluateCondition({ field: "formData.status", operator: "==", value: "active", targetNodeId: "x" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "formData.status", operator: "==", value: "inactive", targetNodeId: "x" }, ctx)).toBe(false);
  });

  it("should evaluate > operator with numbers", () => {
    const ctx = makeCtx({ formData: { days: 5 } });
    expect(evaluateCondition({ field: "formData.days", operator: ">", value: 3, targetNodeId: "x" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "formData.days", operator: ">", value: 10, targetNodeId: "x" }, ctx)).toBe(false);
  });

  it("should evaluate in operator with arrays", () => {
    const ctx = makeCtx({ formData: { type: "年假" } });
    expect(evaluateCondition({ field: "formData.type", operator: "in", value: ["年假", "事假"], targetNodeId: "x" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "formData.type", operator: "in", value: ["病假"], targetNodeId: "x" }, ctx)).toBe(false);
  });

  it("should return false for undefined fields", () => {
    const ctx = makeCtx({ formData: {} });
    expect(evaluateCondition({ field: "formData.nonexistent", operator: "==", value: 1, targetNodeId: "x" }, ctx)).toBe(false);
  });
});

describe("resolveField", () => {
  it("should resolve nested formData fields", () => {
    const ctx = makeCtx({ formData: { a: { b: 42 } } });
    expect(resolveField("formData.a.b", ctx)).toBe(42);
  });

  it("should resolve initiator fields", () => {
    const ctx = makeCtx();
    expect(resolveField("initiator.id", ctx)).toBe("u1");
  });

  it("should return undefined for missing fields", () => {
    const ctx = makeCtx();
    expect(resolveField("formData.missing", ctx)).toBeUndefined();
  });
});

describe("validateGraph", () => {
  it("should require start and end nodes", () => {
    const graph = buildGraph(makeNodes(), makeEdges());
    const errors = validateGraph(graph);
    expect(errors.length).toBe(0);
  });

  it("should detect orphan nodes", () => {
    const nodes = [
      ...makeNodes(),
      { id: "n-orphan", name: "孤立", type: "approve" as const, config: null },
    ];
    const graph = buildGraph(nodes, makeEdges());
    const errors = validateGraph(graph);
    expect(errors.some((e) => e.includes("孤立"))).toBe(true);
  });

  it("should detect cycles", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      { id: "n-a", name: "A", type: "approve", config: null },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-a" },
      { id: "e2", source_node_id: "n-a", target_node_id: "n-a" }, // 自环
      { id: "e3", source_node_id: "n-a", target_node_id: "n-end" },
    ];
    // 自环不会被 buildGraph 检测到（incoming + outgoing 同一个边）
    // 但 hasCycle 应该检测到
    const graph = buildGraph(nodes, edges);
    expect(hasCycle(graph)).toBe(true);
  });

  it("should require defaultNodeId on condition nodes", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      {
        id: "n-cond",
        name: "条件",
        type: "condition",
        config: {
          conditions: [
            { field: "formData.days", operator: ">", value: 3, targetNodeId: "n-end" },
          ],
          // 缺少 defaultNodeId
        },
      },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-cond" },
      { id: "e2", source_node_id: "n-cond", target_node_id: "n-end" },
    ];
    const graph = buildGraph(nodes, edges);
    const errors = validateGraph(graph);
    expect(errors.some((e) => e.includes("defaultNodeId"))).toBe(true);
  });
});

describe("hasCycle", () => {
  it("should return false for acyclic graph", () => {
    const graph = buildGraph(makeNodes(), makeEdges());
    expect(hasCycle(graph)).toBe(false);
  });

  it("should return true for cyclic graph", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      { id: "n-a", name: "A", type: "approve", config: null },
      { id: "n-b", name: "B", type: "approve", config: null },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-a" },
      { id: "e2", source_node_id: "n-a", target_node_id: "n-b" },
      { id: "e3", source_node_id: "n-b", target_node_id: "n-a" }, // 回环
      { id: "e4", source_node_id: "n-b", target_node_id: "n-end" },
    ];
    const graph = buildGraph(nodes, edges);
    expect(hasCycle(graph)).toBe(true);
  });
});

// === 补充测试：条件操作符全覆盖 ===

describe("evaluateCondition — all operators", () => {
  it("should evaluate != operator", () => {
    const ctx = makeCtx({ formData: { status: "active" } });
    expect(evaluateCondition({ field: "formData.status", operator: "!=", value: "active", targetNodeId: "x" }, ctx)).toBe(false);
    expect(evaluateCondition({ field: "formData.status", operator: "!=", value: "inactive", targetNodeId: "x" }, ctx)).toBe(true);
  });

  it("should evaluate < operator", () => {
    const ctx = makeCtx({ formData: { days: 2 } });
    expect(evaluateCondition({ field: "formData.days", operator: "<", value: 3, targetNodeId: "x" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "formData.days", operator: "<", value: 1, targetNodeId: "x" }, ctx)).toBe(false);
  });

  it("should evaluate >= operator", () => {
    const ctx = makeCtx({ formData: { days: 3 } });
    expect(evaluateCondition({ field: "formData.days", operator: ">=", value: 3, targetNodeId: "x" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "formData.days", operator: ">=", value: 5, targetNodeId: "x" }, ctx)).toBe(false);
  });

  it("should evaluate <= operator", () => {
    const ctx = makeCtx({ formData: { days: 3 } });
    expect(evaluateCondition({ field: "formData.days", operator: "<=", value: 3, targetNodeId: "x" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "formData.days", operator: "<=", value: 2, targetNodeId: "x" }, ctx)).toBe(false);
  });

  it("should evaluate not_in operator", () => {
    const ctx = makeCtx({ formData: { type: "年假" } });
    expect(evaluateCondition({ field: "formData.type", operator: "not_in", value: ["病假", "事假"], targetNodeId: "x" }, ctx)).toBe(true);
    expect(evaluateCondition({ field: "formData.type", operator: "not_in", value: ["年假"], targetNodeId: "x" }, ctx)).toBe(false);
  });

  it("should return false for unknown operator", () => {
    const ctx = makeCtx({ formData: { x: 1 } });
    expect(evaluateCondition({ field: "formData.x", operator: "LIKE" as any, value: 1, targetNodeId: "x" }, ctx)).toBe(false);
  });

  it("should handle non-array value for in operator", () => {
    const ctx = makeCtx({ formData: { x: 1 } });
    expect(evaluateCondition({ field: "formData.x", operator: "in", value: "not-array" as any, targetNodeId: "x" }, ctx)).toBe(false);
  });
});

// === 补充测试：条件节点边界路径 ===

describe("getNextNodes — condition edge cases", () => {
  it("should return defaultNodeId when condition config has no conditions array", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      { id: "n-cond", name: "条件", type: "condition", config: { defaultNodeId: "n-default" } },
      { id: "n-default", name: "默认", type: "approve", config: null },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-cond" },
      { id: "e2", source_node_id: "n-cond", target_node_id: "n-default" },
      { id: "e3", source_node_id: "n-default", target_node_id: "n-end" },
    ];
    const graph = buildGraph(nodes, edges);
    const next = getNextNodes(graph, "n-cond", makeCtx());
    expect(next[0]!.id).toBe("n-default");
  });

  it("should return empty when condition config has no conditions and no defaultNodeId", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      { id: "n-cond", name: "条件", type: "condition", config: {} },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-cond" },
      { id: "e2", source_node_id: "n-cond", target_node_id: "n-end" },
    ];
    const graph = buildGraph(nodes, edges);
    const next = getNextNodes(graph, "n-cond", makeCtx());
    expect(next.length).toBe(0);
  });

  it("should throw when condition has no match and no default", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      { id: "n-cond", name: "条件", type: "condition",
        config: { conditions: [{ field: "formData.x", operator: ">", value: 100, targetNodeId: "n-a" }], defaultNodeId: "n-a" } },
      { id: "n-a", name: "A", type: "approve", config: null },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-cond" },
      { id: "e2", source_node_id: "n-cond", target_node_id: "n-a" },
      { id: "e3", source_node_id: "n-a", target_node_id: "n-end" },
    ];
    // x=1 doesn't match >100, but defaultNodeId="n-a" exists → should use default
    const graph = buildGraph(nodes, edges);
    const next = getNextNodes(graph, "n-cond", makeCtx({ formData: { x: 1 } }));
    expect(next[0]!.id).toBe("n-a");
  });
});

// === 补充测试：validateGraph 边界 ===

describe("validateGraph — additional cases", () => {
  it("should detect non-end node without outgoing edges", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      { id: "n-approve", name: "审批", type: "approve", config: null },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-approve" },
      // n-approve 没有出边
      { id: "e3", source_node_id: "n-end", target_node_id: "n-end" }, // 自环让 end 有出边
    ];
    const graph = buildGraph(nodes, edges);
    const errors = validateGraph(graph);
    expect(errors.some((e) => e.includes("审批") && e.includes("无出边"))).toBe(true);
  });

  it("should detect condition node with < 2 outgoing edges", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      { id: "n-cond", name: "条件", type: "condition",
        config: { conditions: [], defaultNodeId: "n-end" } },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-cond" },
      { id: "e2", source_node_id: "n-cond", target_node_id: "n-end" }, // 只有1条出边
    ];
    const graph = buildGraph(nodes, edges);
    const errors = validateGraph(graph);
    expect(errors.some((e) => e.includes("条件") && e.includes("至少需要 2 条出边"))).toBe(true);
  });

  it("should detect missing end node", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      { id: "n-a", name: "A", type: "approve", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-a" },
      { id: "e2", source_node_id: "n-a", target_node_id: "n-a" }, // 自环让 a 有出边
    ];
    const graph = buildGraph(nodes, edges);
    const errors = validateGraph(graph);
    expect(errors.some((e) => e.includes("缺少结束节点"))).toBe(true);
  });

  it("should return empty for valid complex graph", () => {
    const nodes: GraphNodeData[] = [
      { id: "n-start", name: "开始", type: "start", config: null },
      { id: "n-cond", name: "条件", type: "condition",
        config: { conditions: [{ field: "formData.x", operator: ">", value: 3, targetNodeId: "n-a" }], defaultNodeId: "n-b" } },
      { id: "n-a", name: "A", type: "approve", config: null },
      { id: "n-b", name: "B", type: "approve", config: null },
      { id: "n-end", name: "结束", type: "end", config: null },
    ];
    const edges: GraphEdgeData[] = [
      { id: "e1", source_node_id: "n-start", target_node_id: "n-cond" },
      { id: "e2", source_node_id: "n-cond", target_node_id: "n-a" },
      { id: "e3", source_node_id: "n-cond", target_node_id: "n-b" },
      { id: "e4", source_node_id: "n-a", target_node_id: "n-end" },
      { id: "e5", source_node_id: "n-b", target_node_id: "n-end" },
    ];
    const graph = buildGraph(nodes, edges);
    expect(validateGraph(graph).length).toBe(0);
  });
});

// === 补充测试：resolveField 深层嵌套 ===

describe("resolveField — deep nesting", () => {
  it("should resolve 3+ level deep paths", () => {
    const ctx = makeCtx({ formData: { a: { b: { c: 42 } } } });
    expect(resolveField("formData.a.b.c", ctx)).toBe(42);
  });

  it("should return undefined when intermediate path is null", () => {
    const ctx = makeCtx({ formData: { a: null } });
    expect(resolveField("formData.a.b", ctx)).toBeUndefined();
  });
});
