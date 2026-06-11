/**
 * 为流程定义表添加 business_type 字段
 *
 * 用于将流程定义绑定到业务类型（如 leave / expense / purchase），
 * 业务模块可通过 business_type 查找对应的已发布流程定义。
 */

import type { Migration } from "@ventostack/database";

export const addBusinessType: Migration = {
  name: "003_add_business_type",
  up: async (executor) => {
    await executor(
      `ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS business_type VARCHAR(64)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_def_biz_type ON sys_workflow_definition(business_type)`,
    );

    // node 表补充 updated_at（模型 timestamps:true 需要）
    await executor(
      `ALTER TABLE sys_workflow_node ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    );
  },
  down: async (executor) => {
    await executor(`DROP INDEX IF EXISTS idx_sys_wf_def_biz_type`);
    await executor(`ALTER TABLE sys_workflow_definition DROP COLUMN IF EXISTS business_type`);
  },
};
