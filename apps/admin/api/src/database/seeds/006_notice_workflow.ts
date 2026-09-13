import { generateUUID } from '@ventostack/core';
import type { Seed, SqlExecutor } from '@ventostack/database';
import { env } from '../../config';

/** 创建节点与连线：开始 → 部门领导审批 → 结束 */
async function createNodesAndEdges(executor: SqlExecutor, defId: string): Promise<void> {
  const startNodeId = generateUUID();
  const approveNodeId = generateUUID();
  const endNodeId = generateUUID();

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
        strategy: 'parallel_or',
        assignee: { mode: 'lookup', lookupKey: 'initiator_dept_leader' },
        rejectAction: 'return_to_start',
        counterSign: false,
      }),
    ],
  );
  await executor(
    `INSERT INTO sys_workflow_node (id, definition_id, name, type, config, position_x, position_y, sort, created_at, updated_at)
     VALUES ($1, $2, '结束', 'end', NULL, 400, 420, 2, NOW(), NOW())`,
    [endNodeId, defId],
  );

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
}

/**
 * 创建公告发布审批流程定义 + 节点 + 连线。
 *
 * 幂等以 code 为准：唯一索引 idx_sys_wf_def_code 建立在 code 上（全局唯一，
 * 非租户复合），按 tenant_id 过滤会漏掉旧版种子写入的 tenant_id 为 NULL 的
 * 遗留行并触发 23505。遗留行在此收编到当前租户；code 被其他租户占用时跳过。
 */
export const noticeWorkflowSeed: Seed = {
  name: '006_notice_workflow',

  async run(executor) {
    const tenantId = env.TENANT_ID;

    const existing = (await executor(
      `SELECT id, tenant_id FROM sys_workflow_definition WHERE code = 'notice_publish'`,
    )) as Array<{ id: string; tenant_id: string | null }>;

    if (existing.length > 0) {
      const row = existing[0]!;
      if (row.tenant_id !== null) return; // 已属于本租户或其他租户，幂等跳过
      // 收编旧版种子的遗留行（tenant_id 为 NULL）
      await executor(
        `UPDATE sys_workflow_definition SET tenant_id = $1, business_type = 'notice', updated_at = NOW()
         WHERE id = $2 AND tenant_id IS NULL`,
        [tenantId, row.id],
      );
      const nodes = (await executor(
        `SELECT COUNT(*)::int AS cnt FROM sys_workflow_node WHERE definition_id = $1`,
        [row.id],
      )) as Array<{ cnt: number }>;
      if ((nodes[0]?.cnt ?? 0) === 0) {
        await createNodesAndEdges(executor, row.id);
      }
      return;
    }

    const defId = generateUUID();
    await executor(
      `INSERT INTO sys_workflow_definition (id, tenant_id, name, code, version, description, category, business_type, status, created_at, updated_at)
       VALUES ($1, $2, '公告发布审批', 'notice_publish', 1, '公告发布前需经部门领导审批', '系统', 'notice', 1, NOW(), NOW())`,
      [defId, tenantId],
    );
    await createNodesAndEdges(executor, defId);
  },
};
