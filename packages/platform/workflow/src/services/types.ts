/**
 * @ventostack/workflow — 共享类型
 */

/** 审批任务 */
export interface WorkflowTask {
  id: string;
  instanceId: string;
  nodeId: string;
  assigneeId: string;
  action: string | null;
  comment: string | null;
  status: number;
  transferTo: string | null;
  actedAt: string | null;
  createdAt: string;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 分页参数 */
export interface PageParams {
  page?: number;
  pageSize?: number;
}
