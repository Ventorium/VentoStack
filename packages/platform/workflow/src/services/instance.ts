/**
 * @ventostack/workflow — 流程实例服务
 *
 * 实例生命周期：发起、撤回、终止、重新提交、详情查询。
 * 流程推进逻辑委托给 engine/actions.ts。
 */

import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import {
  WorkflowDefModel,
  WorkflowNodeModel,
  WorkflowEdgeModel,
  WorkflowInstanceModel,
  WorkflowTaskModel,
  WorkflowHistoryModel,
} from "../models";
import { buildGraph, buildGraphFromSnapshot } from "../engine/graph";
import type { EngineContext, GraphNodeData, GraphEdgeData } from "../engine/graph";
import type { AssigneeResolver } from "../engine/assignee";
import { workflowErrors } from "../engine/errors";
import {
  insertHistory,
  advanceFromNode,
  type FlowActionDeps,
} from "../engine/actions";

import { InstanceStatus, TaskStatus } from "./constants";
export { InstanceStatus, TaskStatus };

export interface WorkflowInstance {
  id: string; definitionId: string; definitionVer: number;
  businessType: string | null; businessId: string | null;
  initiatorId: string; title: string | null; status: number;
  formData: Record<string, unknown> | null; variables: Record<string, unknown> | null;
  resubmitOf: string | null; tenantId: string | null;
  startedAt: string | null; endedAt: string | null; createdAt: string;
}

export interface WorkflowHistory {
  id: string; instanceId: string; nodeId: string | null;
  taskId: string | null; operatorId: string; action: string;
  comment: string | null; createdAt: string;
}

export interface StartInstanceParams {
  definitionId: string; initiatorId: string;
  businessType?: string; businessId?: string; title?: string;
  formData: Record<string, unknown>; variables?: Record<string, unknown>;
  resubmitOf?: string; tenantId?: string;
}

export type { PageParams, PaginatedResult } from "./types";
export interface InstanceDetail {
  instance: WorkflowInstance; graph: { nodes: GraphNodeData[]; edges: GraphEdgeData[] };
  tasks: unknown[]; history: WorkflowHistory[];
}

export interface InstanceService {
  start(params: StartInstanceParams): Promise<{ instanceId: string }>;
  getDetail(instanceId: string): Promise<InstanceDetail | null>;
  listMy(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowInstance>>;
  withdraw(instanceId: string, userId: string, comment?: string): Promise<void>;
  cancel(instanceId: string, userId: string, comment?: string): Promise<void>;
  resubmit(instanceId: string, userId: string, formData: Record<string, unknown>): Promise<{ instanceId: string }>;
  getHistory(instanceId: string): Promise<WorkflowHistory[]>;
}

export interface InstanceServiceDeps { db: Database; eventBus?: EventBus; assigneeResolver: AssigneeResolver }

export function createInstanceService(deps: InstanceServiceDeps): InstanceService {
  const { db, eventBus, assigneeResolver } = deps;
  const flowDeps: FlowActionDeps = { db, eventBus, assigneeResolver };

  async function start(params: StartInstanceParams): Promise<{ instanceId: string }> {
    const def = await db.query(WorkflowDefModel).where("id", "=", params.definitionId)
      .select("id", "version", "status").get();
    if (!def) throw workflowErrors.defNotFound();
    if (def.status !== 1) throw workflowErrors.defNotActive();

    const [nodes, edges] = await Promise.all([
      db.query(WorkflowNodeModel).where("definition_id", "=", params.definitionId)
        .select("id", "name", "type", "config", "position_x", "position_y", "sort").orderBy("sort", "asc").list(),
      db.query(WorkflowEdgeModel).where("definition_id", "=", params.definitionId)
        .select("id", "source_node_id", "target_node_id", "name", "sort").orderBy("sort", "asc").list(),
    ]);

    const graph = buildGraph(
      nodes.map((n: Record<string, unknown>) => ({
        id: n.id as string, name: n.name as string, type: n.type as GraphNodeData["type"],
        config: n.config as Record<string, unknown> | null,
        position_x: n.position_x as number, position_y: n.position_y as number, sort: n.sort as number,
      })),
      edges.map((e: Record<string, unknown>) => ({
        id: e.id as string, source_node_id: e.source_node_id as string,
        target_node_id: e.target_node_id as string, name: e.name as string, sort: e.sort as number,
      })),
    );

    const instanceId = crypto.randomUUID();
    await db.query(WorkflowInstanceModel).insert({
      id: instanceId, definition_id: params.definitionId, definition_ver: def.version,
      business_type: params.businessType ?? null, business_id: params.businessId ?? null,
      initiator_id: params.initiatorId, title: params.title ?? null,
      status: InstanceStatus.RUNNING, form_data: params.formData, variables: params.variables ?? null,
      graph_snapshot: JSON.stringify({ nodes, edges }),
      resubmit_of: params.resubmitOf ?? null, tenant_id: params.tenantId ?? "default",
      started_at: new Date(),
    });

    const ctx: EngineContext = {
      instanceId, formData: params.formData, variables: params.variables ?? {},
      initiator: { id: params.initiatorId }, operatorId: params.initiatorId,
    };

    await advanceFromNode(flowDeps, db, instanceId, graph, graph.startNodeId, ctx);
    return { instanceId };
  }

  async function getDetail(instanceId: string): Promise<InstanceDetail | null> {
    const inst = await db.query(WorkflowInstanceModel).where("id", "=", instanceId)
      .select("id", "definition_id", "definition_ver", "business_type", "business_id",
        "initiator_id", "title", "status", "form_data", "variables", "graph_snapshot",
        "resubmit_of", "tenant_id", "started_at", "ended_at", "created_at").get();
    if (!inst) return null;

    const snapshot = inst.graph_snapshot as string;
    const graph = snapshot ? JSON.parse(snapshot) as { nodes: GraphNodeData[]; edges: GraphEdgeData[] } : { nodes: [], edges: [] };
    const tasks = await db.query(WorkflowTaskModel).where("instance_id", "=", instanceId)
      .select("id", "instance_id", "node_id", "assignee_id", "action", "comment", "status", "transfer_to", "acted_at", "created_at")
      .orderBy("created_at", "asc").list();
    const history = await getHistory(instanceId);

    return { instance: mapInstance(inst), graph, tasks, history };
  }

  async function listMy(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowInstance>> {
    const { page = 1, pageSize = 10 } = params ?? {};
    const q = db.query(WorkflowInstanceModel).where("initiator_id", "=", userId);
    const total = await q.count();
    const rows = await q.select("id", "definition_id", "definition_ver", "business_type", "business_id",
      "initiator_id", "title", "status", "form_data", "variables", "resubmit_of", "tenant_id",
      "started_at", "ended_at", "created_at")
      .orderBy("created_at", "desc").limit(pageSize).offset((page - 1) * pageSize).list();
    return { items: rows.map(mapInstance), total, page, pageSize };
  }

  async function withdraw(instanceId: string, userId: string, comment?: string): Promise<void> {
    await db.transaction(async (tx) => {
      const inst = await tx.query(WorkflowInstanceModel).where("id", "=", instanceId)
        .select("id", "initiator_id", "status").get();
      if (!inst) throw workflowErrors.instanceNotFound();
      if (inst.initiator_id !== userId) throw workflowErrors.notInitiator();
      if (inst.status !== InstanceStatus.RUNNING) throw workflowErrors.notRunning();

      const allTasks = await tx.query(WorkflowTaskModel).where("instance_id", "=", instanceId)
        .select("id", "status").list();
      const hasActed = allTasks.some((t: { status: number }) => t.status !== TaskStatus.PENDING);
      if (hasActed) throw workflowErrors.cannotWithdraw();

      await tx.raw(`UPDATE sys_workflow_task SET status = $1 WHERE instance_id = $2 AND status = $3`,
        [TaskStatus.VOIDED, instanceId, TaskStatus.PENDING]);
      await tx.query(WorkflowInstanceModel).where("id", "=", instanceId)
        .update({ status: InstanceStatus.WITHDRAWN, ended_at: new Date() });
      await insertHistory(tx, instanceId, null, null, userId, "withdraw", comment ?? "发起人撤回");
    });
    eventBus?.emit("workflow.instance.withdrawn", { instanceId, withdrawnBy: userId });
  }

  async function cancel(instanceId: string, userId: string, comment?: string): Promise<void> {
    await db.transaction(async (tx) => {
      const inst = await tx.query(WorkflowInstanceModel).where("id", "=", instanceId)
        .select("id", "status").get();
      if (!inst) throw workflowErrors.instanceNotFound();
      if (inst.status !== InstanceStatus.RUNNING) throw workflowErrors.notRunning();

      await tx.raw(`UPDATE sys_workflow_task SET status = $1 WHERE instance_id = $2 AND status = $3`,
        [TaskStatus.VOIDED, instanceId, TaskStatus.PENDING]);
      await tx.query(WorkflowInstanceModel).where("id", "=", instanceId)
        .update({ status: InstanceStatus.CANCELLED, ended_at: new Date() });
      await insertHistory(tx, instanceId, null, null, userId, "cancel", comment ?? "管理员终止");
    });
  }

  async function resubmit(instanceId: string, userId: string, formData: Record<string, unknown>): Promise<{ instanceId: string }> {
    const original = await db.query(WorkflowInstanceModel).where("id", "=", instanceId)
      .select("id", "definition_id", "business_type", "business_id", "title", "status", "initiator_id").get();
    if (!original) throw workflowErrors.instanceNotFound();
    if (original.initiator_id !== userId) throw workflowErrors.notInitiator();
    if (original.status !== InstanceStatus.REJECTED && original.status !== InstanceStatus.WITHDRAWN) {
      throw workflowErrors.cannotResubmit();
    }
    return start({
      definitionId: original.definition_id, initiatorId: userId,
      businessType: original.business_type ?? undefined, businessId: original.business_id ?? undefined,
      title: original.title ?? undefined, formData, resubmitOf: instanceId,
    });
  }

  async function getHistory(instanceId: string): Promise<WorkflowHistory[]> {
    const rows = await db.query(WorkflowHistoryModel).where("instance_id", "=", instanceId)
      .select("id", "instance_id", "node_id", "task_id", "operator_id", "action", "comment", "created_at")
      .orderBy("created_at", "asc").list();
    return rows.map(mapHistory);
  }

  return { start, getDetail, listMy, withdraw, cancel, resubmit, getHistory };
}

function mapInstance(row: Record<string, unknown>): WorkflowInstance {
  return {
    id: row.id as string, definitionId: row.definition_id as string,
    definitionVer: (row.definition_ver as number) ?? 1,
    businessType: (row.business_type as string) ?? null,
    businessId: (row.business_id as string) ?? null,
    initiatorId: row.initiator_id as string,
    title: (row.title as string) ?? null, status: row.status as number,
    formData: (row.form_data as Record<string, unknown>) ?? null,
    variables: (row.variables as Record<string, unknown>) ?? null,
    resubmitOf: (row.resubmit_of as string) ?? null,
    tenantId: (row.tenant_id as string) ?? null,
    startedAt: row.started_at ? (row.started_at as Date).toISOString() : null,
    endedAt: row.ended_at ? (row.ended_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function mapHistory(row: Record<string, unknown>): WorkflowHistory {
  return {
    id: row.id as string, instanceId: row.instance_id as string,
    nodeId: (row.node_id as string) ?? null, taskId: (row.task_id as string) ?? null,
    operatorId: row.operator_id as string, action: row.action as string,
    comment: (row.comment as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
