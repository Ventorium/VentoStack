/**
 * 为工作流历史表补齐租户边界字段。
 */

import type { Migration } from "@ventostack/database";

export const addWorkflowHistoryTenant: Migration = {
  name: "004_add_workflow_history_tenant",
  up: async (executor) => {
    await executor(
      `ALTER TABLE sys_workflow_history ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36) DEFAULT 'default'`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_hist_tenant_inst ON sys_workflow_history(tenant_id, instance_id)`,
    );
  },
  down: async (executor) => {
    await executor(`DROP INDEX IF EXISTS idx_sys_wf_hist_tenant_inst`);
    await executor(`ALTER TABLE sys_workflow_history DROP COLUMN IF EXISTS tenant_id`);
  },
};
