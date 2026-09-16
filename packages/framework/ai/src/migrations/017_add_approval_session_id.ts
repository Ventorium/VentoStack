import type { Migration } from '@ventostack/database';

/**
 * 审批单关联会话：聊天内审批把审批台账写回会话 JSONL 需要按 approval id 反查 sessionId，
 * 决议可能来自任意路径（聊天自确认 / 管理员审批 / 超时过期），因此落在表上而不是进程内存。
 */
export const addApprovalSessionId: Migration = {
  name: '017_add_approval_session_id',
  async up(executor): Promise<void> {
    await executor(
      `ALTER TABLE ai_approval_request ADD COLUMN IF NOT EXISTS session_id VARCHAR(36)`,
    );
    await executor(
      `CREATE INDEX IF NOT EXISTS idx_ai_approval_request_session ON ai_approval_request (session_id)`,
    );
  },
  async down(executor): Promise<void> {
    await executor(`DROP INDEX IF EXISTS idx_ai_approval_request_session`);
    await executor(`ALTER TABLE ai_approval_request DROP COLUMN IF EXISTS session_id`);
  },
};
