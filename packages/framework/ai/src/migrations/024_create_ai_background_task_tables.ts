import type { Migration } from '@ventostack/database';

/**
 * 后台任务（Agent Background Task）持久化
 *
 * 解决的问题：Agent 发起的长任务（超大文件下载、外部系统轮询、定时监控）不能绑在
 * 一次对话 run 上——会话结束/进程重启后任务要继续，并且要能按定时/条件把同一会话
 * 「唤醒」继续执行。
 *
 * 三张表各司其职（参考 pi 的 durable operation + deferred handle 语义）：
 *   - ai_background_task：任务本体（意图 + 调度 + 执行句柄），状态机与租约字段支持多实例抢占；
 *   - ai_background_task_run：run 台账（每次触发/脚本执行一行，审计与 UI 历史）；
 *   - ai_session_run：会话级运行租约（Web 对话、渠道入站、后台触发共用，避免并发写同一 JSONL）。
 *
 * 为什么不复用 sys_schedule_job：平台定时任务表没有 tenant_id（多租户不可用）、
 * handler 需要预注册、且没有 run 台账与租约，无法承载「用户级后台任务」。
 */
export const createAiBackgroundTaskTables: Migration = {
  name: '024_create_ai_background_task_tables',

  async up(executor) {
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_background_task (
        id                   VARCHAR(36) PRIMARY KEY,
        tenant_id            VARCHAR(64) NOT NULL,
        user_id              VARCHAR(64) NOT NULL,
        agent_id             VARCHAR(64) NOT NULL,
        session_id           VARCHAR(64) NOT NULL,
        title                VARCHAR(200) NOT NULL,
        kind                 VARCHAR(16) NOT NULL,
        status               VARCHAR(16) NOT NULL,
        command              TEXT,
        condition_command    TEXT,
        prompt               TEXT,
        schedule_kind        VARCHAR(16),
        schedule_expr        VARCHAR(128),
        resume_on_finish     BOOLEAN NOT NULL DEFAULT TRUE,
        notify_on_finish     BOOLEAN NOT NULL DEFAULT TRUE,
        max_runs             INTEGER NOT NULL DEFAULT 100,
        run_count            INTEGER NOT NULL DEFAULT 0,
        next_run_at          TIMESTAMP,
        last_run_at          TIMESTAMP,
        last_run_id          VARCHAR(36),
        last_error           TEXT,
        lease_owner          VARCHAR(64),
        lease_expires_at     TIMESTAMP,
        instance_id          VARCHAR(64),
        sandbox_id           VARCHAR(64),
        exec_pid             VARCHAR(32),
        exec_log_path        TEXT,
        exec_exit_path       TEXT,
        created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 会话内任务列表（对话页「后台任务」页签）
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_bg_task_session
        ON ai_background_task(tenant_id, session_id, created_at DESC)
    `);
    // 用户级任务列表（全局后台任务页）
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_bg_task_user
        ON ai_background_task(tenant_id, user_id, created_at DESC)
    `);
    // 调度扫描：只索引「可被领取」的状态，避免全表扫
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_bg_task_due
        ON ai_background_task(status, next_run_at)
        WHERE status IN ('pending', 'waiting')
    `);
    // 运行中脚本的探活扫描
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_bg_task_running
        ON ai_background_task(status, kind)
        WHERE status = 'running'
    `);

    await executor(`
      CREATE TABLE IF NOT EXISTS ai_background_task_run (
        id             VARCHAR(36) PRIMARY KEY,
        task_id        VARCHAR(36) NOT NULL,
        tenant_id      VARCHAR(64) NOT NULL,
        user_id        VARCHAR(64) NOT NULL,
        session_id     VARCHAR(64) NOT NULL,
        trigger        VARCHAR(16) NOT NULL,
        status         VARCHAR(16) NOT NULL,
        scheduled_at   TIMESTAMP,
        started_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at    TIMESTAMP,
        exit_code      INTEGER,
        output         TEXT,
        error          TEXT,
        final_content  TEXT,
        created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_bg_task_run_task
        ON ai_background_task_run(tenant_id, task_id, started_at DESC)
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_bg_task_run_session
        ON ai_background_task_run(tenant_id, session_id, started_at DESC)
    `);
    // 调度幂等：同一任务的同一计划触发点只能产生一条 run 台账
    await executor(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_bg_task_run_schedule
        ON ai_background_task_run(task_id, scheduled_at)
        WHERE trigger = 'schedule' AND scheduled_at IS NOT NULL
    `);
    // 进行中的 run（进程重启后用于标记 interrupted）
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_bg_task_run_running
        ON ai_background_task_run(status, started_at)
        WHERE status = 'running'
    `);

    // 会话运行租约：同一会话同一时刻只允许一个 agent run 写历史
    await executor(`
      CREATE TABLE IF NOT EXISTS ai_session_run (
        session_id      VARCHAR(64) PRIMARY KEY,
        token           VARCHAR(64) NOT NULL,
        kind            VARCHAR(16) NOT NULL,
        tenant_id       VARCHAR(64) NOT NULL,
        user_id         VARCHAR(64) NOT NULL,
        owner_instance  VARCHAR(64) NOT NULL,
        started_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at      TIMESTAMP NOT NULL,
        updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await executor(`
      CREATE INDEX IF NOT EXISTS idx_ai_session_run_expired
        ON ai_session_run(expires_at)
    `);
  },

  async down(executor) {
    await executor('DROP TABLE IF EXISTS ai_session_run');
    await executor('DROP TABLE IF EXISTS ai_background_task_run');
    await executor('DROP TABLE IF EXISTS ai_background_task');
  },
};
