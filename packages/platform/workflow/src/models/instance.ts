/**
 * 工作流实例模型
 */

import { column, defineModel } from "@ventostack/database";

export const WorkflowInstanceModel = defineModel(
  "sys_workflow_instance",
  {
    id: column.varchar({ primary: true, length: 36 }),
    definition_id: column.varchar({ length: 36 }),
    definition_ver: column.int({ default: 1 }),
    business_type: column.varchar({ length: 64, nullable: true }),
    business_id: column.varchar({ length: 36, nullable: true }),
    initiator_id: column.varchar({ length: 36 }),
    title: column.varchar({ length: 255, nullable: true }),
    current_node_id: column.varchar({ length: 36, nullable: true }),
    status: column.int({ default: 0 }),
    form_data: column.json({ nullable: true }),
    variables: column.json({ nullable: true }),
    graph_snapshot: column.json({ nullable: true }),
    resubmit_of: column.varchar({ length: 36, nullable: true }),
    tenant_id: column.varchar({ length: 36, nullable: true }),
    started_at: column.timestamp({ nullable: true }),
    ended_at: column.timestamp({ nullable: true }),
  },
  { timestamps: true },
);
