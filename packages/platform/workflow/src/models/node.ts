/**
 * 工作流节点模型
 */

import { defineModel, column } from "@ventostack/database";

export const WorkflowNodeModel = defineModel("sys_workflow_node", {
  id: column.varchar({ primary: true, length: 36 }),
  definition_id: column.varchar({ length: 36 }),
  name: column.varchar({ length: 128 }),
  type: column.varchar({ length: 32 }),
  assignee_type: column.varchar({ length: 32, nullable: true }),
  assignee_id: column.varchar({ length: 36, nullable: true }),
  sort: column.int({ default: 0 }),
  config: column.json({ nullable: true }),
}, { timestamps: true });
