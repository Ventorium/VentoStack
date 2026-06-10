/**
 * @ventostack/workflow — 图构建 / 遍历 / 校验
 *
 * 全部为纯函数，零 DB 依赖，可独立单测。
 */

import { workflowErrors } from "./errors";

/** 节点类型 */
export type NodeType = "start" | "end" | "approve" | "cc" | "condition";

/** 节点数据（DB 原始格式） */
export interface GraphNodeData {
  id: string;
  name: string;
  type: NodeType;
  config: Record<string, unknown> | null;
  position_x?: number;
  position_y?: number;
  sort?: number;
}

/** 边数据（DB 原始格式） */
export interface GraphEdgeData {
  id: string;
  source_node_id: string;
  target_node_id: string;
  name?: string;
  sort?: number;
}

/** 图节点（含邻接表） */
export interface GraphNode extends GraphNodeData {
  outgoingEdges: string[];
  incomingEdges: string[];
}

/** 图边 */
export type GraphEdge = GraphEdgeData;

/** 工作流图 */
export interface WorkflowGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  startNodeId: string;
}

/** 引擎运行时上下文 */
export interface EngineContext {
  instanceId: string;
  formData: Record<string, unknown>;
  variables: Record<string, unknown>;
  initiator: {
    id: string;
    name?: string;
    deptId?: string;
    roles?: string[];
    superiorId?: string;
    deptLeaderId?: string;
  };
  operatorId: string;
}

/** 条件项 */
export interface ConditionItem {
  field: string;
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "not_in";
  value: unknown;
  targetNodeId: string;
}

/** 条件节点 config */
export interface ConditionNodeConfig {
  conditions: ConditionItem[];
  defaultNodeId: string;
}

/**
 * 从节点/边数据构建 WorkflowGraph
 * 纯函数：重建邻接表，找到 start 节点
 */
export function buildGraph(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
): WorkflowGraph {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  for (const n of nodes) {
    nodeMap.set(n.id, {
      ...n,
      outgoingEdges: [],
      incomingEdges: [],
    });
  }

  for (const e of edges) {
    edgeMap.set(e.id, e);
    nodeMap.get(e.source_node_id)?.outgoingEdges.push(e.id);
    nodeMap.get(e.target_node_id)?.incomingEdges.push(e.id);
  }

  const startNodes = [...nodeMap.values()].filter((n) => n.type === "start");
  if (startNodes.length === 0) throw workflowErrors.noStartNode();
  if (startNodes.length > 1) throw workflowErrors.invalidGraph("流程不能有多个开始节点");
  const startNode = startNodes[0]!;

  return { nodes: nodeMap, edges: edgeMap, startNodeId: startNode.id };
}

/**
 * 从 JSON 快照重建 WorkflowGraph
 */
export function buildGraphFromSnapshot(snapshot: string): WorkflowGraph {
  const { nodes, edges } = JSON.parse(snapshot) as {
    nodes: GraphNodeData[];
    edges: GraphEdgeData[];
  };
  return buildGraph(nodes, edges);
}

/**
 * 条件求值
 * 纯函数：根据条件项和上下文判断是否满足
 */
export function evaluateCondition(cond: ConditionItem, ctx: EngineContext): boolean {
  const fieldValue = resolveField(cond.field, ctx);

  switch (cond.operator) {
    case "==":
      return fieldValue === cond.value;
    case "!=":
      return fieldValue !== cond.value;
    case ">":
      return Number(fieldValue) > Number(cond.value);
    case "<":
      return Number(fieldValue) < Number(cond.value);
    case ">=":
      return Number(fieldValue) >= Number(cond.value);
    case "<=":
      return Number(fieldValue) <= Number(cond.value);
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(fieldValue);
    case "not_in":
      return Array.isArray(cond.value) && !cond.value.includes(fieldValue);
    default:
      return false;
  }
}

/**
 * 解析字段值
 * 支持嵌套路径如 "formData.days"、"initiator.deptId"
 */
export function resolveField(field: string, ctx: EngineContext): unknown {
  const parts = field.split(".");
  let current: unknown = ctx;
  for (const part of parts) {
    if (current && typeof current === "object" && Object.hasOwn(current, part)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * 获取下一节点
 * 纯函数：根据当前节点类型和上下文，返回下一步应该进入的节点列表
 */
export function getNextNodes(
  graph: WorkflowGraph,
  currentNodeId: string,
  ctx: EngineContext,
): GraphNode[] {
  const currentNode = graph.nodes.get(currentNodeId);
  if (!currentNode) return [];
  if (currentNode.type === "end") return [];

  const outgoing = currentNode.outgoingEdges
    .map((id) => graph.edges.get(id)!)
    .filter(Boolean)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  // 条件网关：用 config 中的 ConditionGroup 求值
  if (currentNode.type === "condition") {
    const config = currentNode.config as unknown as ConditionNodeConfig;
    if (!config?.conditions) {
      if (config?.defaultNodeId) {
        const def = graph.nodes.get(config.defaultNodeId);
        return def ? [def] : [];
      }
      return [];
    }

    for (const cond of config.conditions) {
      if (evaluateCondition(cond, ctx)) {
        const target = graph.nodes.get(cond.targetNodeId);
        if (target) return [target];
      }
    }

    // 默认路径
    if (config.defaultNodeId) {
      const def = graph.nodes.get(config.defaultNodeId);
      if (def) return [def];
    }

    throw workflowErrors.noCondition();
  }

  // 普通节点：走第一条边
  const firstEdge = outgoing[0];
  if (!firstEdge) return [];
  const target = graph.nodes.get(firstEdge.target_node_id);
  return target ? [target] : [];
}

/**
 * 验证流程图结构完整性
 * 纯函数：返回错误列表（空数组 = 合法）
 */
export function validateGraph(graph: WorkflowGraph): string[] {
  const errors: string[] = [];

  const hasStart = [...graph.nodes.values()].some((n) => n.type === "start");
  const hasEnd = [...graph.nodes.values()].some((n) => n.type === "end");
  if (!hasStart) errors.push("缺少开始节点");
  if (!hasEnd) errors.push("缺少结束节点");

  for (const node of graph.nodes.values()) {
    if (node.type !== "start" && node.incomingEdges.length === 0) {
      errors.push(`节点「${node.name}」无入边`);
    }
    if (node.type !== "end" && node.outgoingEdges.length === 0) {
      errors.push(`节点「${node.name}」无出边`);
    }
    if (node.type === "condition") {
      if (node.outgoingEdges.length < 2) {
        errors.push(`条件网关「${node.name}」至少需要 2 条出边`);
      }
      const cfg = node.config as unknown as ConditionNodeConfig | null;
      if (!cfg?.defaultNodeId) {
        errors.push(`条件网关「${node.name}」必须设置默认路径(defaultNodeId)`);
      }
    }
  }

  if (hasCycle(graph)) {
    errors.push("流程图存在循环");
  }

  return errors;
}

/**
 * 检测有向图中是否存在环（BFS 拓扑排序）
 * 纯函数
 */
export function hasCycle(graph: WorkflowGraph): boolean {
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes.values()) {
    inDegree.set(node.id, 0);
  }
  for (const node of graph.nodes.values()) {
    for (const edgeId of node.outgoingEdges) {
      const edge = graph.edges.get(edgeId);
      if (edge) {
        inDegree.set(edge.target_node_id, (inDegree.get(edge.target_node_id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited++;
    const node = graph.nodes.get(current);
    if (node) {
      for (const edgeId of node.outgoingEdges) {
        const edge = graph.edges.get(edgeId);
        if (edge) {
          const newDeg = (inDegree.get(edge.target_node_id) ?? 1) - 1;
          inDegree.set(edge.target_node_id, newDeg);
          if (newDeg === 0) queue.push(edge.target_node_id);
        }
      }
    }
  }

  return visited < graph.nodes.size;
}
