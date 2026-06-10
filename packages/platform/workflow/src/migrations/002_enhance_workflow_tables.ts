/**
 * 增强工作流表结构
 *
 * - 现有表增加字段（instance: 快照/表单/租户; task: 转办/到期/租户; definition: 分类/表单/设置）
 * - 新增 edge 表（连线定义）
 * - 新增 history 表（操作历史）
 * - 优化索引（多租户复合索引、history 查询索引）
 */

import type { Migration } from "@ventostack/database";

export const enhanceWorkflowTables: Migration = {
  name: "002_enhance_workflow_tables",
  up: async (executor) => {
    // === 现有表增加字段 ===

    // definition 增强
    await executor(
      `ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS category VARCHAR(64)`,
    );
    await executor(
      `ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS form_config JSON`,
    );
    await executor(
      `ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS settings JSON`,
    );
    await executor(
      `ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS created_by VARCHAR(36)`,
    );
    await executor(
      `ALTER TABLE sys_workflow_definition ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36)`,
    );

    // node 增强
    await executor(
      `ALTER TABLE sys_workflow_node ADD COLUMN IF NOT EXISTS position_x FLOAT DEFAULT 0`,
    );
    await executor(
      `ALTER TABLE sys_workflow_node ADD COLUMN IF NOT EXISTS position_y FLOAT DEFAULT 0`,
    );

    // instance 增强
    await executor(
      `ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS definition_ver INT DEFAULT 1`,
    );
    await executor(
      `ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS title VARCHAR(255)`,
    );
    await executor(
      `ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS form_data JSON`,
    );
    await executor(
      `ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS graph_snapshot JSON`,
    );
    await executor(
      `ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS resubmit_of VARCHAR(36)`,
    );
    await executor(
      `ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36) DEFAULT 'default'`,
    );
    await executor(
      `ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS started_at TIMESTAMP`,
    );
    await executor(
      `ALTER TABLE sys_workflow_instance ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP`,
    );

    // task 增强
    await executor(
      `ALTER TABLE sys_workflow_task ADD COLUMN IF NOT EXISTS transfer_to VARCHAR(36)`,
    );
    await executor(
      `ALTER TABLE sys_workflow_task ADD COLUMN IF NOT EXISTS due_at TIMESTAMP`,
    );
    await executor(
      `ALTER TABLE sys_workflow_task ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(36) DEFAULT 'default'`,
    );
    await executor(
      `ALTER TABLE sys_workflow_task ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`,
    );

    // === 新建表 ===

    await executor(`
      CREATE TABLE IF NOT EXISTS sys_workflow_edge (
        id              VARCHAR(36) PRIMARY KEY,
        definition_id   VARCHAR(36) NOT NULL,
        source_node_id  VARCHAR(36) NOT NULL,
        target_node_id  VARCHAR(36) NOT NULL,
        name            VARCHAR(128),
        sort            INT DEFAULT 0,
        config          JSON,
        created_at      TIMESTAMP DEFAULT NOW()
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS sys_workflow_history (
        id              VARCHAR(36) PRIMARY KEY,
        instance_id     VARCHAR(36) NOT NULL,
        node_id         VARCHAR(36),
        task_id         VARCHAR(36),
        operator_id     VARCHAR(36) NOT NULL,
        action          VARCHAR(32) NOT NULL,
        comment         TEXT,
        form_snapshot   JSON,
        metadata        JSON,
        created_at      TIMESTAMP DEFAULT NOW()
      )
    `);

    // === 索引 ===

    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_def_category ON sys_workflow_definition(category)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_def_tenant ON sys_workflow_definition(tenant_id)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_edge_def ON sys_workflow_edge(definition_id)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_edge_source ON sys_workflow_edge(source_node_id)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_inst_tenant ON sys_workflow_instance(tenant_id)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_inst_resubmit ON sys_workflow_instance(resubmit_of)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_task_tenant_assignee ON sys_workflow_task(tenant_id, assignee_id, status)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_hist_inst_action ON sys_workflow_history(instance_id, action)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_sys_wf_hist_operator ON sys_workflow_history(operator_id)`,
    );
  },
  down: async (executor) => {
    await executor(`DROP TABLE IF EXISTS sys_workflow_history`);
    await executor(`DROP TABLE IF EXISTS sys_workflow_edge`);
  },
};
