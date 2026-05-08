/**
 * 工作流任务模型
 */

import { defineModel, column } from "@ventostack/database";

export const WorkflowTaskModel = defineModel("sys_workflow_task", {
  id: column.varchar({ primary: true, length: 36 }),
  instance_id: column.varchar({ length: 36 }),
  node_id: column.varchar({ length: 36 }),
  assignee_id: column.varchar({ length: 36 }),
  action: column.varchar({ length: 32, nullable: true }),
  comment: column.text({ nullable: true }),
  status: column.int({ default: 0 }),
  acted_at: column.timestamp({ nullable: true }),
}, { timestamps: true });
