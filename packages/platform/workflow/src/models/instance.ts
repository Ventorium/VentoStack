/**
 * 工作流实例模型
 */

import { defineModel, column } from "@ventostack/database";

export const WorkflowInstanceModel = defineModel("sys_workflow_instance", {
  id: column.varchar({ primary: true, length: 36 }),
  definition_id: column.varchar({ length: 36 }),
  business_type: column.varchar({ length: 64, nullable: true }),
  business_id: column.varchar({ length: 36, nullable: true }),
  initiator_id: column.varchar({ length: 36 }),
  current_node_id: column.varchar({ length: 36, nullable: true }),
  status: column.int({ default: 0 }),
  variables: column.json({ nullable: true }),
}, { timestamps: true });
