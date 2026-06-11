/**
 * @ventostack/workflow — 工作流事件定义
 *
 * 所有工作流生命周期事件的类型安全定义。
 * 供 engine/actions.ts、services/task.ts、services/instance.ts 发射，
 * 供外部模块（如通知）监听。
 */

import { defineEvent } from "@ventostack/events";

/** 审批任务已创建（待审批人处理） */
export interface WorkflowTaskCreatedPayload {
  instanceId: string;
  assigneeId: string;
  nodeId: string;
}
export const workflowTaskCreated = defineEvent<WorkflowTaskCreatedPayload>(
  "workflow.task.created",
);

/** 审批任务被催办 */
export interface WorkflowTaskUrgePayload {
  taskId: string;
  instanceId: string;
  assigneeId: string;
  urgedBy: string;
}
export const workflowTaskUrge = defineEvent<WorkflowTaskUrgePayload>(
  "workflow.task.urge",
);

/** 流程实例完结（全部通过） */
export interface WorkflowInstanceCompletedPayload {
  instanceId: string;
}
export const workflowInstanceCompleted =
  defineEvent<WorkflowInstanceCompletedPayload>("workflow.instance.completed");

/** 流程实例被驳回 */
export interface WorkflowInstanceRejectedPayload {
  instanceId: string;
}
export const workflowInstanceRejected =
  defineEvent<WorkflowInstanceRejectedPayload>("workflow.instance.rejected");

/** 流程实例被撤回 */
export interface WorkflowInstanceWithdrawnPayload {
  instanceId: string;
  withdrawnBy: string;
}
export const workflowInstanceWithdrawn =
  defineEvent<WorkflowInstanceWithdrawnPayload>("workflow.instance.withdrawn");
