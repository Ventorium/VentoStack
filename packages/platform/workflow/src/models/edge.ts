/**
 * 工作流连线模型
 */

import { column, defineModel } from "@ventostack/database";

export const WorkflowEdgeModel = defineModel(
  "sys_workflow_edge",
  {
    id: column.varchar({ primary: true, length: 36 }),
    definition_id: column.varchar({ length: 36 }),
    source_node_id: column.varchar({ length: 36 }),
    target_node_id: column.varchar({ length: 36 }),
    name: column.varchar({ length: 128, nullable: true }),
    sort: column.int({ default: 0 }),
    config: column.json({ nullable: true }),
  },
  { timestamps: true },
);
