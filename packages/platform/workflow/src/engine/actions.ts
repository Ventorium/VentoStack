/**
 * @ventostack/workflow — 共享流程引擎操作
 *
 * 被 instance.ts 和 task.ts 共用的流程控制函数。
 * 通过 deps 参数接收依赖，不依赖闭包。
 */

import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import {
  WorkflowInstanceModel,
  WorkflowTaskModel,
  WorkflowHistoryModel,
} from "../models";
import {
  getNextNodes,
  type EngineContext,
  type GraphNode,
  type WorkflowGraph,
} from "./graph";
import type { AssigneeResolver, ApproveNodeConfig } from "./assignee";
import { isNodeCompleted, type ApprovalStrategy } from "./strategy";
import {
  workflowInstanceCompleted,
  workflowInstanceRejected,
  workflowTaskCreated,
} from "../events";

import { InstanceStatus as IS, TaskStatus as TS } from "../services/constants";

export interface FlowActionDeps {
  db: Database;
  eventBus?: EventBus;
  assigneeResolver: AssigneeResolver;
}

export async function insertHistory(
  dbOrTx: Database,
  instanceId: string,
  nodeId: string | null,
  taskId: string | null,
  operatorId: string,
  action: string,
  comment: string | null,
  tenantId?: string,
): Promise<void> {
  await dbOrTx.query(WorkflowHistoryModel).insert({
    id: crypto.randomUUID(),
    instance_id: instanceId,
    node_id: nodeId,
    task_id: taskId,
    operator_id: operatorId,
    action,
    comment,
    tenant_id: tenantId ?? null,
  });
}

export async function completeInstance(
  dbOrTx: Database,
  instanceId: string,
  operatorId: string,
  eventBus?: EventBus,
  tenantId?: string,
): Promise<void> {
  // 幂等性保护：只有 RUNNING 状态才执行完结
  const current = await dbOrTx.query(WorkflowInstanceModel).where("id", "=", instanceId)
    .select("id", "status").get();
  if (!current || current.status !== IS.RUNNING) return;

  await dbOrTx
    .query(WorkflowInstanceModel)
    .where("id", "=", instanceId)
    .update({ status: IS.COMPLETED, ended_at: new Date() });
  await insertHistory(dbOrTx, instanceId, null, null, operatorId, "instance_completed", "流程完结", tenantId);
  eventBus?.emit(workflowInstanceCompleted, { instanceId });
}

export async function createTasksForNode(
  deps: FlowActionDeps,
  dbOrTx: Database,
  instanceId: string,
  node: GraphNode,
  ctx: EngineContext,
  tenantId?: string,
): Promise<void> {
  const config = node.config as unknown as ApproveNodeConfig | null;
  const strategy: ApprovalStrategy = config?.strategy ?? "sequential";
  const assignees = await deps.assigneeResolver.resolve(node, ctx);
  if (assignees.length === 0) {
    if (config?.onEmptyAssignee === "skip") return;
    throw new Error(`节点「${node.name}」无可用审批人`);
  }

  if (strategy === "sequential") {
    await dbOrTx.query(WorkflowTaskModel).insert({
      id: crypto.randomUUID(), instance_id: instanceId, node_id: node.id,
      assignee_id: assignees[0]!, status: TS.PENDING,
      tenant_id: tenantId ?? null,
    });
    deps.eventBus?.emit(workflowTaskCreated, { instanceId, assigneeId: assignees[0]!, nodeId: node.id });
  } else {
    for (const assigneeId of assignees) {
      await dbOrTx.query(WorkflowTaskModel).insert({
        id: crypto.randomUUID(), instance_id: instanceId, node_id: node.id,
        assignee_id: assigneeId, status: TS.PENDING,
        tenant_id: tenantId ?? null,
      });
      deps.eventBus?.emit(workflowTaskCreated, { instanceId, assigneeId, nodeId: node.id });
    }
  }
}

export async function advanceFromNode(
  deps: FlowActionDeps,
  dbOrTx: Database,
  instanceId: string,
  graph: WorkflowGraph,
  currentNodeId: string,
  ctx: EngineContext,
  tenantId?: string,
): Promise<void> {
  await insertHistory(dbOrTx, instanceId, currentNodeId, null, ctx.operatorId, "node_entered", null, tenantId);
  const currentNode = graph.nodes.get(currentNodeId);
  if (!currentNode) return;

  // 直接进入 end 节点时（如 processNodeCompletion 推进到结束），完成实例
  if (currentNode.type === "end") {
    await insertHistory(dbOrTx, instanceId, currentNodeId, null, ctx.operatorId, "node_completed", null, tenantId);
    await completeInstance(dbOrTx, instanceId, ctx.operatorId, deps.eventBus, tenantId);
    return;
  }

  const nextNodes = getNextNodes(graph, currentNodeId, ctx);
  if (nextNodes.length === 0) {
    throw new Error(`节点「${currentNode.name}」无后续节点`);
  }

  for (const nextNode of nextNodes) {
    switch (nextNode.type) {
      case "start":
        await advanceFromNode(deps, dbOrTx, instanceId, graph, nextNode.id, ctx, tenantId);
        break;
      case "end":
        await insertHistory(dbOrTx, instanceId, currentNodeId, null, ctx.operatorId, "node_completed", null, tenantId);
        await completeInstance(dbOrTx, instanceId, ctx.operatorId, deps.eventBus, tenantId);
        break;
      case "approve":
        await insertHistory(dbOrTx, instanceId, currentNodeId, null, ctx.operatorId, "node_completed", null, tenantId);
        await createTasksForNode(deps, dbOrTx, instanceId, nextNode, ctx, tenantId);
        break;
      case "cc":
        await insertHistory(dbOrTx, instanceId, currentNodeId, null, ctx.operatorId, "node_completed", null, tenantId);
        await advanceFromNode(deps, dbOrTx, instanceId, graph, nextNode.id, ctx, tenantId);
        break;
      case "condition":
        await advanceFromNode(deps, dbOrTx, instanceId, graph, nextNode.id, ctx, tenantId);
        break;
    }
  }
}

export async function processNodeCompletion(
  deps: FlowActionDeps,
  tx: Database,
  instanceId: string,
  graph: WorkflowGraph,
  nodeId: string,
  ctx: EngineContext,
  tenantId?: string,
): Promise<void> {
  const node = graph.nodes.get(nodeId)!;
  const config = node.config as unknown as ApproveNodeConfig | null;
  const strategy: ApprovalStrategy = config?.strategy ?? "sequential";

  const allTasks = await tx
    .query(WorkflowTaskModel)
    .where("instance_id", "=", instanceId)
    .where("node_id", "=", nodeId)
    .select("id", "assignee_id", "status")
    .list();

  const result = isNodeCompleted(allTasks, strategy, config?.percentage);

  if (!result.completed) {
    if (strategy === "sequential") {
      const assignees = await deps.assigneeResolver.resolve(node, ctx);
      const assignedIds = new Set(allTasks.map((t: { assignee_id: string }) => t.assignee_id));
      const nextAssignee = assignees.find((id) => !assignedIds.has(id));
      if (nextAssignee) {
        await tx.query(WorkflowTaskModel).insert({
          id: crypto.randomUUID(), instance_id: instanceId, node_id: nodeId,
          assignee_id: nextAssignee, status: TS.PENDING,
          tenant_id: tenantId ?? null,
        });
        deps.eventBus?.emit(workflowTaskCreated, { instanceId, assigneeId: nextAssignee, nodeId });
      }
    }
    return;
  }

  await insertHistory(tx, instanceId, nodeId, null, ctx.operatorId, "node_completed", null, tenantId);
  const hasRejected = allTasks.some(
    (t: { status: number }) => t.status === TS.REJECTED,
  );

  if (hasRejected) {
    await handleNodeReject(deps, tx, instanceId, graph, nodeId, ctx, tenantId);
  } else {
    for (const nextNode of getNextNodes(graph, nodeId, ctx)) {
      await advanceFromNode(deps, tx, instanceId, graph, nextNode.id, ctx, tenantId);
    }
  }
}

export async function handleNodeReject(
  deps: FlowActionDeps,
  tx: Database,
  instanceId: string,
  graph: WorkflowGraph,
  nodeId: string,
  ctx: EngineContext,
  tenantId?: string,
): Promise<void> {
  const node = graph.nodes.get(nodeId)!;
  const config = node.config as unknown as ApproveNodeConfig | null;
  const rejectAction = config?.rejectAction ?? "terminate";

  switch (rejectAction) {
    case "terminate":
      await tx.query(WorkflowInstanceModel).where("id", "=", instanceId).update({
        status: IS.REJECTED, ended_at: new Date(),
      });
      await insertHistory(tx, instanceId, nodeId, null, ctx.operatorId, "instance_rejected", null, tenantId);
      deps.eventBus?.emit(workflowInstanceRejected, { instanceId });
      break;
    case "return_to_previous": {
      const prevNodeId = findPreviousApproveNode(graph, nodeId);
      if (!prevNodeId) {
        // 找不到前一个审批节点，降级为终止
        await tx.query(WorkflowInstanceModel).where("id", "=", instanceId).update({
          status: IS.REJECTED, ended_at: new Date(),
        });
        await insertHistory(tx, instanceId, nodeId, null, ctx.operatorId, "instance_rejected", "回退失败，自动终止", tenantId);
        deps.eventBus?.emit(workflowInstanceRejected, { instanceId });
        break;
      }
      await voidTasksByNode(tx, instanceId, nodeId, [TS.PENDING]);
      await advanceFromNode(deps, tx, instanceId, graph, prevNodeId, ctx, tenantId);
      break;
    }
    case "return_to_start":
      await voidTasksByNode(tx, instanceId, nodeId, [TS.PENDING]);
      await advanceFromNode(deps, tx, instanceId, graph, graph.startNodeId, ctx, tenantId);
      break;
  }
}

function findPreviousApproveNode(graph: WorkflowGraph, nodeId: string): string | null {
  const node = graph.nodes.get(nodeId);
  if (!node) return null;
  for (const edgeId of node.incomingEdges) {
    const edge = graph.edges.get(edgeId);
    if (edge) {
      const src = graph.nodes.get(edge.source_node_id);
      if (src?.type === "approve") return src.id;
      const deeper = findPreviousApproveNode(graph, edge.source_node_id);
      if (deeper) return deeper;
    }
  }
  return null;
}

async function voidTasksByNode(
  db: Database, instanceId: string, nodeId: string, statuses: number[],
): Promise<void> {
  await db.raw(
    `SELECT id FROM sys_workflow_task WHERE instance_id = $1 AND node_id = $2 AND status = ANY($3) FOR UPDATE`,
    [instanceId, nodeId, statuses],
  );
  await db.raw(
    `UPDATE sys_workflow_task SET status = 5 WHERE instance_id = $1 AND node_id = $2 AND status = ANY($3)`,
    [instanceId, nodeId, statuses],
  );
}
