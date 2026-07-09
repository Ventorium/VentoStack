/**
 * 工作流操作历史模型
 */

import { column, defineModel } from "@ventostack/database";

export const WorkflowHistoryModel = defineModel(
  "sys_workflow_history",
  {
    id: column.varchar({ primary: true, length: 36 }),
    instance_id: column.varchar({ length: 36 }),
    node_id: column.varchar({ length: 36, nullable: true }),
    task_id: column.varchar({ length: 36, nullable: true }),
    operator_id: column.varchar({ length: 36 }),
    action: column.varchar({ length: 32 }),
    comment: column.text({ nullable: true }),
    tenant_id: column.varchar({ length: 36, nullable: true }),
    form_snapshot: column.json({ nullable: true }),
    metadata: column.json({ nullable: true }),
  },
  { timestamps: true },
);
