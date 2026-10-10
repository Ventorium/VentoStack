import type { Migration } from '@ventostack/database';

/**
 * 清除被 `@ventostack/ai-context` 取代的 `@ventostack/ai-trace` 遗留对象。
 *
 * 删除顺序有强制的先后关系：
 *  1. `sys_menu` 的 `parent_id` 外键是 ON DELETE RESTRICT —— 按钮（type=3，追踪开关配置）
 *     是菜单（type=2，链路追踪）的子行，必须先删子行，否则父行删除会被 RESTRICT 直接拒绝。
 *  2. `sys_role_menu.menu_id` 是 ON DELETE CASCADE —— 角色授权随菜单自动清理，无需显式 DELETE。
 *
 * 本迁移在种子之前执行（app.ts: runMigrations → runSeeds），因此旧的 trace 菜单先被清掉，
 * 随后 011_ai_context 种子再创建 /app/ai/context 菜单，二者不会互相覆盖。
 *
 * 历史 trace 数据不可恢复：down() 只能重建空表结构，无法还原已删除的调用链记录。
 */
export const dropAiTraceArtifacts: Migration = {
  name: '020_drop_ai_trace_artifacts',
  async up(executor) {
    // 按钮行（ai:trace:config、ai:trace:list）先于父菜单删除，满足 RESTRICT 外键
    await executor(
      "DELETE FROM sys_menu WHERE permission LIKE 'ai:trace:%' OR path = '/app/ai/trace'",
    );

    // 采集开关配置键已由 ai_context_enabled 取代
    await executor("DELETE FROM sys_config WHERE key = 'ai_trace_enabled'");

    await executor('DROP TABLE IF EXISTS ai_trace_span');
    await executor('DROP TABLE IF EXISTS ai_trace');
  },

  /** 仅重建空表结构；历史调用链数据无法还原 */
  async down(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_trace (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        conversation_id VARCHAR(64) NOT NULL,
        agent_id VARCHAR(64),
        session_id VARCHAR(64),
        user_id VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'running',
        user_message TEXT,
        assistant_preview TEXT,
        system_prompt TEXT,
        model VARCHAR(128),
        meta JSONB,
        usage JSONB,
        error TEXT,
        turn_count INTEGER NOT NULL DEFAULT 0,
        tool_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP
      )
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_trace_span (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        trace_id VARCHAR(36) NOT NULL,
        tenant_id VARCHAR(64) NOT NULL,
        seq INTEGER NOT NULL DEFAULT 0,
        turn_index INTEGER NOT NULL DEFAULT 0,
        span_type VARCHAR(16) NOT NULL,
        name VARCHAR(128) NOT NULL,
        category VARCHAR(24),
        status VARCHAR(16) NOT NULL DEFAULT 'running',
        input JSONB,
        output JSONB,
        error TEXT,
        started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        duration_ms INTEGER
      )
    `);

    await executor('CREATE INDEX IF NOT EXISTS idx_ai_trace_conv ON ai_trace (tenant_id, conversation_id, started_at DESC)');
    await executor('CREATE INDEX IF NOT EXISTS idx_ai_trace_time ON ai_trace (tenant_id, started_at DESC)');
    await executor('CREATE INDEX IF NOT EXISTS idx_ai_trace_span_trace ON ai_trace_span (trace_id, seq)');
  },
};
