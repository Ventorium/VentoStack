import type { Migration } from "@ventostack/database";

/** 行 id 是「会话内」序号拼出来的，四张明细表都要把主键收紧到真实身份 */
const SCOPED_TABLES = [
  "ai_context_node",
  "ai_context_request",
  "ai_context_event",
  "ai_context_file_op",
] as const;

/**
 * 修正上下文四张明细表的行主键作用域。
 *
 * 背景：这些表的 id 形如 `n-${seq}` / `r-${seq}` / `e-${seq}`，而 seq 是**会话内**序号
 * —— 每个会话的第一个 run 都从 0 开始重新计数。001 迁移却把 id 单独设成了主键，
 * 于是新会话生成的 `n-1-sys` / `r-3` 会和历史会话的同名行撞主键：
 * insertNode/insertRequest 抛唯一约束冲突 → recorder 里整个 applyOps 事务回滚
 * → 该 run 的组成元素与请求快照全部丢失（只留一条 error 日志）。
 * 外部表现就是「上下文」页签里模型请求 0、助手回复 0、上下文浏览器空。
 *
 * 行的真实身份是 (租户, 会话, 行内 id)：改成复合主键后跨会话同名不再冲突，
 * 会话内 seq 单调递增保证会话内唯一。存量数据 id 本身已全局唯一，
 * 收紧为复合主键不会失败（复合键的前提只是三者都非空，001 已保证）。
 */
export const scopeContextRowIds: Migration = {
  name: "002_scope_ai_context_row_ids",

  async up(executor) {
    for (const table of SCOPED_TABLES) {
      await executor(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_pkey`);
      await executor(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_pkey PRIMARY KEY (tenant_id, session_id, id)`,
      );
    }
  },

  /**
   * 回滚会退回 id 单列主键：若此时已存在跨会话重名行，回滚将失败 ——
   * 这是数据事实决定的，不做静默去重。
   */
  async down(executor) {
    for (const table of SCOPED_TABLES) {
      await executor(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_pkey`);
      await executor(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_pkey PRIMARY KEY (id)`);
    }
  },
};
