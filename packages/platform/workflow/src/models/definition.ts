/**
 * 工作流定义模型
 */

import { column, defineModel } from "@ventostack/database";

export const WorkflowDefModel = defineModel(
  "sys_workflow_definition",
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 128 }),
    code: column.varchar({ length: 64 }),
    version: column.int({ default: 1 }),
    description: column.text({ nullable: true }),
    category: column.varchar({ length: 64, nullable: true }),
    business_type: column.varchar({ length: 64, nullable: true }),
    form_config: column.json({ nullable: true }),
    settings: column.json({ nullable: true }),
    status: column.int({ default: 1 }),
    created_by: column.varchar({ length: 36, nullable: true }),
    tenant_id: column.varchar({ length: 36, nullable: true }),
  },
  { timestamps: true },
);
