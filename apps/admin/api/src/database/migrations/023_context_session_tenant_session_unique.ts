/**
 * 023_context_session_tenant_session_unique
 *
 * 给 ai_context_session 补 (tenant_id, session_id) 唯一索引。
 *
 * 背景：001_create_ai_context_tables 只建了 id 主键，但 context-store 的
 * upsertSession 用 `ON CONFLICT (tenant_id, session_id)` 做「同一会话多次
 * run 合并计数」——该子句引用的列上没有唯一约束，Postgres 在解析期就报
 * 「no unique or exclusion constraint matching the ON CONFLICT specification」，
 * 导致 upsertSession 每次必失败、ai_context_session 永远插不进记录。
 *
 * 用唯一索引而非 ALTER TABLE ADD CONSTRAINT：前者支持 IF NOT EXISTS 幂等，
 * 且 ON CONFLICT 对唯一索引与唯一约束一视同仁。
 */
import type { Migration } from '@ventostack/database';

export const addContextSessionTenantSessionUnique: Migration = {
  name: '023_context_session_tenant_session_unique',

  async up(executor) {
    await executor(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_ctx_session_tenant_session
         ON ai_context_session (tenant_id, session_id)`,
    );
  },

  async down(executor) {
    await executor('DROP INDEX IF EXISTS uq_ai_ctx_session_tenant_session');
  },
};
