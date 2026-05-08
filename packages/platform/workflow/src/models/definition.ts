/**
 * 工作流定义模型
 */

import { defineModel, column } from "@ventostack/database";

export const WorkflowDefModel = defineModel("sys_workflow_definition", {
  id: column.varchar({ primary: true, length: 36 }),
  name: column.varchar({ length: 128 }),
  code: column.varchar({ length: 64 }),
  version: column.int({ default: 1 }),
  description: column.text({ nullable: true }),
  status: column.int({ default: 1 }),
}, { timestamps: true });
