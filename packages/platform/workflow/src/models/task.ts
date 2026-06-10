/**
 * 工作流任务模型
 */

import { column, defineModel } from "@ventostack/database";

export const WorkflowTaskModel = defineModel(
  "sys_workflow_task",
  {
    id: column.varchar({ primary: true, length: 36 }),
    instance_id: column.varchar({ length: 36 }),
    node_id: column.varchar({ length: 36 }),
    assignee_id: column.varchar({ length: 36 }),
    action: column.varchar({ length: 32, nullable: true }),
    comment: column.text({ nullable: true }),
    status: column.int({ default: 0 }),
    transfer_to: column.varchar({ length: 36, nullable: true }),
    acted_at: column.timestamp({ nullable: true }),
    due_at: column.timestamp({ nullable: true }),
    tenant_id: column.varchar({ length: 36, nullable: true }),
  },
  { timestamps: true },
);
