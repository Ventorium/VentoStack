/**
 * @ventostack/workflow — 任务服务
 *
 * 审批任务操作：通过、驳回、转办、加签、催办、查询。
 * 流程推进逻辑委托给 engine/actions.ts。
 */

import type { Database } from "@ventostack/database";
import type { EventBus } from "@ventostack/events";
import { WorkflowTaskModel, WorkflowInstanceModel, WorkflowHistoryModel } from "../models";
import { buildGraphFromSnapshot, type EngineContext, type WorkflowGraph } from "../engine/graph";
import type { AssigneeResolver, ApproveNodeConfig } from "../engine/assignee";
import { workflowErrors } from "../engine/errors";
import { TaskStatus } from "./constants";
import type { PaginatedResult, PageParams, WorkflowTask } from "./types";
import {
  insertHistory,
  processNodeCompletion,
  advanceFromNode,
  type FlowActionDeps,
} from "../engine/actions";

export interface TaskService {
  approve(taskId: string, userId: string, comment?: string): Promise<void>;
  reject(taskId: string, userId: string, comment?: string): Promise<void>;
  transfer(taskId: string, userId: string, targetUserId: string, comment?: string): Promise<void>;
  addSign(taskId: string, userId: string, targetUserIds: string[], comment?: string): Promise<void>;
  urge(taskId: string, userId: string): Promise<void>;
  listMy(userId: string, params?: TaskListParams): Promise<PaginatedResult<WorkflowTask>>;
  listMyDone(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowTask>>;
}

export interface TaskListParams extends PageParams { status?: number }
export interface TaskServiceDeps { db: Database; eventBus?: EventBus; assigneeResolver: AssigneeResolver }

export function createTaskService(deps: TaskServiceDeps): TaskService {
  const { db, eventBus, assigneeResolver } = deps;
  const flowDeps: FlowActionDeps = { db, eventBus, assigneeResolver };

  async function approve(taskId: string, userId: string, comment?: string): Promise<void> {
    await db.transaction(async (tx) => {
      const updated = await tx.raw(
        `UPDATE sys_workflow_task SET status = 1, action = 'approve', comment = $3, acted_at = NOW()
         WHERE id = $1 AND status = 0 AND assignee_id = $2`,
        [taskId, userId, comment ?? null],
      );
      if (updated.rowCount === 0) {
        const task = await tx.raw(`SELECT status, assignee_id FROM sys_workflow_task WHERE id = $1`, [taskId]);
        if (task.length === 0) throw workflowErrors.taskNotFound();
        if (task[0].assignee_id !== userId) throw workflowErrors.notAssignee();
        throw workflowErrors.taskAlreadyActed();
      }
      const task = await tx.raw(`SELECT instance_id, node_id FROM sys_workflow_task WHERE id = $1`, [taskId]);
      const { instance_id: instanceId, node_id: nodeId } = task[0];
      await insertHistory(tx, instanceId, nodeId, taskId, userId, "approve", comment ?? null);

      const instance = await tx.query(WorkflowInstanceModel).where("id", "=", instanceId)
        .select("graph_snapshot", "form_data", "variables", "initiator_id").get();
      const graph = buildGraphFromSnapshot(instance.graph_snapshot as string);
      const ctx: EngineContext = {
        instanceId,
        formData: (instance.form_data as Record<string, unknown>) ?? {},
        variables: (instance.variables as Record<string, unknown>) ?? {},
        initiator: { id: instance.initiator_id as string },
        operatorId: userId,
      };
      await processNodeCompletion(flowDeps, tx, instanceId, graph, nodeId, ctx);
    });
  }

  async function reject(taskId: string, userId: string, comment?: string): Promise<void> {
    await db.transaction(async (tx) => {
      const updated = await tx.raw(
        `UPDATE sys_workflow_task SET status = 2, action = 'reject', comment = $3, acted_at = NOW()
         WHERE id = $1 AND status = 0 AND assignee_id = $2`,
        [taskId, userId, comment ?? null],
      );
      if (updated.rowCount === 0) {
        const task = await tx.raw(`SELECT status, assignee_id FROM sys_workflow_task WHERE id = $1`, [taskId]);
        if (task.length === 0) throw workflowErrors.taskNotFound();
        if (task[0].assignee_id !== userId) throw workflowErrors.notAssignee();
        throw workflowErrors.taskAlreadyActed();
      }
      const task = await tx.raw(`SELECT instance_id, node_id FROM sys_workflow_task WHERE id = $1`, [taskId]);
      const { instance_id: instanceId, node_id: nodeId } = task[0];
      await insertHistory(tx, instanceId, nodeId, taskId, userId, "reject", comment ?? null);

      const instance = await tx.query(WorkflowInstanceModel).where("id", "=", instanceId)
        .select("graph_snapshot", "form_data", "variables", "initiator_id").get();
      const graph = buildGraphFromSnapshot(instance.graph_snapshot as string);
      const ctx: EngineContext = {
        instanceId,
        formData: (instance.form_data as Record<string, unknown>) ?? {},
        variables: (instance.variables as Record<string, unknown>) ?? {},
        initiator: { id: instance.initiator_id as string },
        operatorId: userId,
      };
      await processNodeCompletion(flowDeps, tx, instanceId, graph, nodeId, ctx);
    });
  }

  async function transfer(taskId: string, userId: string, targetUserId: string, comment?: string): Promise<void> {
    if (userId === targetUserId) throw workflowErrors.invalidAssignee();
    await db.transaction(async (tx) => {
      const updated = await tx.raw(
        `UPDATE sys_workflow_task SET status = 3, action = 'transfer', transfer_to = $3, comment = $4, acted_at = NOW()
         WHERE id = $1 AND status = 0 AND assignee_id = $2`,
        [taskId, userId, targetUserId, comment ?? null],
      );
      if (updated.rowCount === 0) {
        const existing = await tx.raw(`SELECT status, assignee_id FROM sys_workflow_task WHERE id = $1`, [taskId]);
        if (existing.length === 0) throw workflowErrors.taskNotFound();
        if (existing[0].assignee_id !== userId) throw workflowErrors.notAssignee();
        throw workflowErrors.taskAlreadyActed();
      }

      const task = await tx.raw(`SELECT instance_id, node_id FROM sys_workflow_task WHERE id = $1`, [taskId]);
      const { instance_id: instanceId, node_id: nodeId } = task[0];

      await tx.query(WorkflowTaskModel).insert({
        id: crypto.randomUUID(), instance_id: instanceId, node_id: nodeId,
        assignee_id: targetUserId, status: TaskStatus.PENDING,
      });
      await insertHistory(tx, instanceId, nodeId, taskId, userId, "transfer", `转办给 ${targetUserId}: ${comment ?? ""}`);
    });
  }

  async function addSign(taskId: string, userId: string, targetUserIds: string[], comment?: string): Promise<void> {
    if (targetUserIds.length > 20) throw workflowErrors.invalidAssignee();
    await db.transaction(async (tx) => {
      const task = await tx.raw(`SELECT instance_id, node_id, status, assignee_id FROM sys_workflow_task WHERE id = $1`, [taskId]);
      if (task.length === 0) throw workflowErrors.taskNotFound();
      if (task[0].status !== 0) throw workflowErrors.taskAlreadyActed();
      if (task[0].assignee_id !== userId) throw workflowErrors.notAssignee();

      const instance = await tx.query(WorkflowInstanceModel).where("id", "=", task[0].instance_id)
        .select("graph_snapshot").get();
      const graph = buildGraphFromSnapshot(instance.graph_snapshot as string);
      const node = graph.nodes.get(task[0].node_id);
      const config = node?.config as unknown as ApproveNodeConfig | null;
      if (!config?.counterSign) throw workflowErrors.counterSignDisabled();

      await tx.raw(`UPDATE sys_workflow_task SET status = 1, action = 'add_sign', comment = $2, acted_at = NOW() WHERE id = $1`,
        [taskId, comment ?? "加签"]);
      for (const targetId of targetUserIds) {
        await tx.query(WorkflowTaskModel).insert({
          id: crypto.randomUUID(), instance_id: task[0].instance_id,
          node_id: task[0].node_id, assignee_id: targetId, status: TaskStatus.PENDING,
        });
      }
      await insertHistory(tx, task[0].instance_id, task[0].node_id, taskId, userId, "add_sign",
        `加签给 ${targetUserIds.join(",")}: ${comment ?? ""}`);
    });
  }

  async function urge(taskId: string, userId: string): Promise<void> {
    const task = await db.raw(`SELECT instance_id, assignee_id FROM sys_workflow_task WHERE id = $1 AND status = 0`, [taskId]);
    if (task.length === 0) throw workflowErrors.taskNotFound();
    eventBus?.emit("workflow.task.urge", {
      taskId, instanceId: task[0].instance_id,
      assigneeId: task[0].assignee_id, urgedBy: userId,
    });
  }

  async function listMy(userId: string, params?: TaskListParams): Promise<PaginatedResult<WorkflowTask>> {
    const { status, page = 1, pageSize = 10 } = params ?? {};
    let q = db.query(WorkflowTaskModel).where("assignee_id", "=", userId);
    if (status !== undefined) q = q.where("status", "=", status);
    const total = await q.count();
    const rows = await q
      .select("id", "instance_id", "node_id", "assignee_id", "action", "comment", "status", "transfer_to", "acted_at", "created_at")
      .orderBy("created_at", "desc").limit(pageSize).offset((page - 1) * pageSize).list();
    return { items: rows.map(mapTask), total, page, pageSize };
  }

  async function listMyDone(userId: string, params?: PageParams): Promise<PaginatedResult<WorkflowTask>> {
    const { page = 1, pageSize = 10 } = params ?? {};
    const q = db.query(WorkflowTaskModel).where("assignee_id", "=", userId).where("status", "!=", TaskStatus.PENDING);
    const total = await q.count();
    const rows = await q
      .select("id", "instance_id", "node_id", "assignee_id", "action", "comment", "status", "transfer_to", "acted_at", "created_at")
      .orderBy("acted_at", "desc").limit(pageSize).offset((page - 1) * pageSize).list();
    return { items: rows.map(mapTask), total, page, pageSize };
  }

  return { approve, reject, transfer, addSign, urge, listMy, listMyDone };
}

function mapTask(row: Record<string, unknown>): WorkflowTask {
  return {
    id: row.id as string, instanceId: row.instance_id as string,
    nodeId: row.node_id as string, assigneeId: row.assignee_id as string,
    action: (row.action as string) ?? null, comment: (row.comment as string) ?? null,
    status: row.status as number, transferTo: (row.transfer_to as string) ?? null,
    actedAt: row.acted_at ? (row.acted_at as Date).toISOString() : null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}
