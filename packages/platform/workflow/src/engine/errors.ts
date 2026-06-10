/**
 * @ventostack/workflow — 工作流错误定义
 *
 * 所有工作流业务错误统一定义，继承 VentoStackError。
 * 路由层通过 instanceof VentoStackError 统一处理。
 */

import { VentoStackError } from "@ventostack/core";

/** 工作流业务错误 */
export class WorkflowError extends VentoStackError {
  readonly cause?: Error;

  constructor(message: string, code: number, errorCode: string, cause?: Error) {
    super(message, code, errorCode);
    this.name = "WorkflowError";
    if (cause) this.cause = cause;
  }
}

/** 工作流错误工厂 — 统一创建错误实例 */
export const workflowErrors = {
  noStartNode: () =>
    new WorkflowError("流程缺少开始节点", 400, "WF_NO_START_NODE"),

  invalidGraph: (detail: string) =>
    new WorkflowError(detail, 400, "WF_INVALID_GRAPH"),

  defNotActive: () =>
    new WorkflowError("流程定义未发布", 400, "WF_DEF_NOT_ACTIVE"),

  noCondition: () =>
    new WorkflowError("条件网关无匹配路径且无默认路径", 500, "WF_NO_MATCHING_CONDITION"),

  noNextNode: (nodeName: string) =>
    new WorkflowError(`节点「${nodeName}」无后续节点`, 500, "WF_NO_NEXT_NODE"),

  noAssignee: (nodeName: string) =>
    new WorkflowError(`节点「${nodeName}」无可用审批人`, 400, "WF_NO_ASSIGNEE"),

  invalidAssignee: () =>
    new WorkflowError("表单指定的审批人不存在或已停用", 400, "WF_INVALID_ASSIGNEE"),

  counterSignDisabled: () =>
    new WorkflowError("该节点不允许加签", 403, "WF_COUNTER_SIGN_DISABLED"),

  taskNotFound: () =>
    new WorkflowError("任务不存在", 404, "WF_TASK_NOT_FOUND"),

  taskAlreadyActed: () =>
    new WorkflowError("任务已处理", 409, "WF_TASK_ALREADY_ACTED"),

  notAssignee: () =>
    new WorkflowError("非当前审批人", 403, "WF_NOT_ASSIGNEE"),

  notInitiator: () =>
    new WorkflowError("只有发起人可以撤回", 403, "WF_NOT_INITIATOR"),

  notRunning: () =>
    new WorkflowError("实例不在进行中", 400, "WF_NOT_RUNNING"),

  cannotWithdraw: () =>
    new WorkflowError("已有审批人操作，无法撤回", 400, "WF_CANNOT_WITHDRAW"),

  cannotResubmit: () =>
    new WorkflowError("只有已拒绝或已撤回的申请可以重新提交", 400, "WF_CANNOT_RESUBMIT"),

  instanceNotFound: () =>
    new WorkflowError("实例不存在", 404, "WF_INSTANCE_NOT_FOUND"),

  defNotFound: () =>
    new WorkflowError("流程定义不存在", 404, "WF_DEF_NOT_FOUND"),

  createTaskFailed: (cause?: Error) =>
    new WorkflowError("创建审批任务失败", 500, "WF_CREATE_TASK_FAILED", cause),
} as const;
