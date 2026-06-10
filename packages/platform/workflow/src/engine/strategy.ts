/**
 * @ventostack/workflow — 审批策略引擎
 *
 * 纯函数：根据任务列表和策略类型判断节点是否完成。
 */

/** 审批策略类型 */
export type ApprovalStrategy = "sequential" | "parallel_and" | "parallel_or" | "percentage";

/** 任务信息（策略计算所需的最小字段） */
export interface TaskInfo {
  id: string;
  assignee_id: string;
  status: number;
}

/** 策略判定结果 */
export interface StrategyResult {
  completed: boolean;
  reason: string;
}

/** 任务状态常量 */
const STATUS = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
  TRANSFERRED: 3,
  WITHDRAWN: 4,
  VOIDED: 5,
} as const;

/**
 * 过滤掉已作废/已转办/已撤回的任务
 * 只保留活跃任务（pending/approved/rejected）
 */
export function getActiveTasks(tasks: TaskInfo[]): TaskInfo[] {
  return tasks.filter(
    (t) =>
      t.status !== STATUS.VOIDED &&
      t.status !== STATUS.TRANSFERRED &&
      t.status !== STATUS.WITHDRAWN,
  );
}

/**
 * 判断节点是否完成
 * 纯函数：输入活跃任务列表 + 策略类型 → 输出判定结果
 */
export function isNodeCompleted(
  tasks: TaskInfo[],
  strategy: ApprovalStrategy,
  percentage?: number,
): StrategyResult {
  const active = getActiveTasks(tasks);
  const pending = active.filter((t) => t.status === STATUS.PENDING);
  const approved = active.filter((t) => t.status === STATUS.APPROVED);
  const rejected = active.filter((t) => t.status === STATUS.REJECTED);

  switch (strategy) {
    case "sequential": {
      if (rejected.length > 0) return { completed: true, reason: "有人驳回" };
      if (pending.length > 0) return { completed: false, reason: "等待当前审批人" };
      if (active.length === 0) return { completed: false, reason: "无活跃任务" };
      return { completed: true, reason: "全部通过" };
    }

    case "parallel_and": {
      if (rejected.length > 0) return { completed: true, reason: "会签有人驳回" };
      if (active.length === 0) return { completed: false, reason: "无活跃任务" };
      if (pending.length > 0)
        return {
          completed: false,
          reason: `会签等待中 (${approved.length}/${active.length})`,
        };
      return { completed: true, reason: "会签全部通过" };
    }

    case "parallel_or": {
      if (approved.length > 0) return { completed: true, reason: "或签已有通过" };
      if (active.length === 0) return { completed: false, reason: "无活跃任务" };
      if (rejected.length === active.length)
        return { completed: true, reason: "或签全部驳回" };
      return { completed: false, reason: "或签等待中" };
    }

    case "percentage": {
      const threshold = percentage ?? 50;
      const total = active.length;
      if (total === 0) return { completed: false, reason: "无活跃任务" };

      const approvalRate = (approved.length / total) * 100;
      const rejectionRate = (rejected.length / total) * 100;

      if (approvalRate >= threshold)
        return {
          completed: true,
          reason: `通过率 ${approvalRate.toFixed(0)}% >= ${threshold}%`,
        };
      if (rejectionRate > 100 - threshold)
        return {
          completed: true,
          reason: `驳回率过高 (${rejectionRate.toFixed(0)}%)`,
        };
      return {
        completed: false,
        reason: `百分比审批中 (${approvalRate.toFixed(0)}%/${threshold}%)`,
      };
    }

    default:
      return { completed: false, reason: "未知策略" };
  }
}
