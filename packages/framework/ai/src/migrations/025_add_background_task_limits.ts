import type { Migration } from '@ventostack/database';

/**
 * 后台任务兜底字段
 *
 * 「任务一直不结束」是后台任务最典型的失控场景（下载卡死、脚本挂起、执行实例崩溃），
 * 必须在数据层有硬边界，而不是只靠人工盯：
 *   - max_runtime_seconds / deadline_at：脚本任务最大运行时长，到点由 runner 终止并标记失败；
 *   - expires_at：定时任务有效期，到期自动结束，避免遗忘的任务无限触发消耗 token；
 *   - consecutive_failures：连续失败计数，达到阈值自动暂停（不再无人值守地反复失败）。
 *
 * 索引只覆盖活跃状态，避免全表扫。
 */
export const addBackgroundTaskLimits: Migration = {
  name: '025_add_background_task_limits',
  async up(executor) {
    await executor(
      'ALTER TABLE ai_background_task ADD COLUMN IF NOT EXISTS max_runtime_seconds INTEGER',
    );
    await executor('ALTER TABLE ai_background_task ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMP');
    await executor('ALTER TABLE ai_background_task ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP');
    await executor(
      'ALTER TABLE ai_background_task ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0',
    );
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_bg_task_deadline
        ON ai_background_task(deadline_at)
        WHERE status = 'running'
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_bg_task_expiry
        ON ai_background_task(expires_at)
        WHERE status IN ('pending', 'waiting', 'paused', 'running')
    `);
  },
  async down(executor) {
    await executor('DROP INDEX IF EXISTS idx_ai_bg_task_expiry');
    await executor('DROP INDEX IF EXISTS idx_ai_bg_task_deadline');
    await executor('ALTER TABLE ai_background_task DROP COLUMN IF EXISTS consecutive_failures');
    await executor('ALTER TABLE ai_background_task DROP COLUMN IF EXISTS expires_at');
    await executor('ALTER TABLE ai_background_task DROP COLUMN IF EXISTS deadline_at');
    await executor('ALTER TABLE ai_background_task DROP COLUMN IF EXISTS max_runtime_seconds');
  },
};
