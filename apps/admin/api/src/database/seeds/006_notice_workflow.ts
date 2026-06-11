import { generateUUID } from "@ventostack/core";
import type { Seed } from "@ventostack/database";

/**
 * 创建公告发布审批流程定义 + 节点 + 连线。
 * 幂等：如果已存在 business_type='notice' 的定义则跳过。
 *
 * 流程：开始 → 部门领导审批 → 结束
 * 审批通过后业务方可调用 publish 接口发布。
 */
export const noticeWorkflowSeed: Seed = {
  name: "006_notice_workflow",

  async run(executor) {
    const existing = await executor(
      `SELECT id FROM sys_workflow_definition WHERE business_type = 'notice'`,
    );
    if ((existing as unknown[]).length > 0) return;

    const defId = generateUUID();
    const startNodeId = generateUUID();
    const approveNodeId = generateUUID();
    const endNodeId = generateUUID();

    // 创建流程定义（已发布状态）
    await executor(
      `INSERT INTO sys_workflow_definition (id, name, code, version, description, category, business_type, status, created_at, updated_at)
       VALUES ($1, '公告发布审批', 'notice_publish', 1, '公告发布前需经部门领导审批', '系统', 'notice', 1, NOW(), NOW())`,
      [defId],
    );

    // 创建节点
    await executor(
      `INSERT INTO sys_workflow_node (id, definition_id, name, type, config, position_x, position_y, sort, created_at, updated_at)
       VALUES ($1, $2, '开始', 'start', NULL, 400, 80, 0, NOW(), NOW())`,
      [startNodeId, defId],
    );

    await executor(
      `INSERT INTO sys_workflow_node (id, definition_id, name, type, config, position_x, position_y, sort, created_at, updated_at)
       VALUES ($1, $2, '部门领导审批', 'approve', $3, 400, 250, 1, NOW(), NOW())`,
      [
        approveNodeId,
        defId,
        JSON.stringify({
          strategy: "parallel_or",
          assignee: { mode: "lookup", lookupKey: "initiator_dept_leader" },
          rejectAction: "return_to_start",
          counterSign: false,
        }),
      ],
    );

    await executor(
      `INSERT INTO sys_workflow_node (id, definition_id, name, type, config, position_x, position_y, sort, created_at, updated_at)
       VALUES ($1, $2, '结束', 'end', NULL, 400, 420, 2, NOW(), NOW())`,
      [endNodeId, defId],
    );

    // 创建连线：开始 → 审批 → 结束
    await executor(
      `INSERT INTO sys_workflow_edge (id, definition_id, source_node_id, target_node_id, name, sort, created_at)
       VALUES ($1, $2, $3, $4, NULL, 0, NOW())`,
      [generateUUID(), defId, startNodeId, approveNodeId],
    );
    await executor(
      `INSERT INTO sys_workflow_edge (id, definition_id, source_node_id, target_node_id, name, sort, created_at)
       VALUES ($1, $2, $3, $4, NULL, 1, NOW())`,
      [generateUUID(), defId, approveNodeId, endNodeId],
    );
  },
};
