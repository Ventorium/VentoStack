/**
 * @ventostack/workflow — 共享状态常量
 *
 * 被 instance.ts / task.ts / actions.ts 共用。
 */

/** 流程实例状态 */
export const InstanceStatus = {
  RUNNING: 0, COMPLETED: 1, REJECTED: 2, WITHDRAWN: 3, CANCELLED: 4,
} as const;

/** 审批任务状态 */
export const TaskStatus = {
  PENDING: 0, APPROVED: 1, REJECTED: 2, TRANSFERRED: 3, WITHDRAWN: 4, VOIDED: 5,
} as const;

/** 流程定义状态 */
export const DefStatus = { DRAFT: 0, ACTIVE: 1, DISABLED: 2 } as const;
