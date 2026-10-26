import { column, defineModel } from '@ventostack/database';

/** 后台任务本体：意图 + 调度 + 执行句柄（migration 024） */
export const AiBackgroundTaskModel = defineModel(
  'ai_background_task',
  {
    id: column.varchar({ primary: true, length: 36 }),
    tenant_id: column.varchar({ length: 64 }),
    user_id: column.varchar({ length: 64 }),
    agent_id: column.varchar({ length: 64 }),
    session_id: column.varchar({ length: 64 }),
    title: column.varchar({ length: 200 }),
    kind: column.varchar({ length: 16 }),
    status: column.varchar({ length: 16 }),
    command: column.text({ nullable: true }),
    condition_command: column.text({ nullable: true }),
    prompt: column.text({ nullable: true }),
    schedule_kind: column.varchar({ length: 16, nullable: true }),
    schedule_expr: column.varchar({ length: 128, nullable: true }),
    resume_on_finish: column.boolean({ default: true }),
    notify_on_finish: column.boolean({ default: true }),
    max_runs: column.int({ default: 100 }),
    run_count: column.int({ default: 0 }),
    next_run_at: column.timestamp({ nullable: true }),
    last_run_at: column.timestamp({ nullable: true }),
    last_run_id: column.varchar({ length: 36, nullable: true }),
    last_error: column.text({ nullable: true }),
    lease_owner: column.varchar({ length: 64, nullable: true }),
    lease_expires_at: column.timestamp({ nullable: true }),
    instance_id: column.varchar({ length: 64, nullable: true }),
    sandbox_id: column.varchar({ length: 64, nullable: true }),
    exec_pid: column.varchar({ length: 32, nullable: true }),
    exec_log_path: column.text({ nullable: true }),
    exec_exit_path: column.text({ nullable: true }),
  },
  { timestamps: true },
);

/** 后台任务运行台账：每次脚本执行 / 每次会话唤醒一行（migration 024） */
export const AiBackgroundTaskRunModel = defineModel(
  'ai_background_task_run',
  {
    id: column.varchar({ primary: true, length: 36 }),
    task_id: column.varchar({ length: 36 }),
    tenant_id: column.varchar({ length: 64 }),
    user_id: column.varchar({ length: 64 }),
    session_id: column.varchar({ length: 64 }),
    trigger: column.varchar({ length: 16 }),
    status: column.varchar({ length: 16 }),
    scheduled_at: column.timestamp({ nullable: true }),
    started_at: column.timestamp(),
    finished_at: column.timestamp({ nullable: true }),
    exit_code: column.int({ nullable: true }),
    output: column.text({ nullable: true }),
    error: column.text({ nullable: true }),
    final_content: column.text({ nullable: true }),
  },
  { timestamps: true },
);

/** 会话运行租约：Web 对话 / 渠道入站 / 后台触发共用（migration 024） */
export const AiSessionRunModel = defineModel(
  'ai_session_run',
  {
    session_id: column.varchar({ primary: true, length: 64 }),
    token: column.varchar({ length: 64 }),
    kind: column.varchar({ length: 16 }),
    tenant_id: column.varchar({ length: 64 }),
    user_id: column.varchar({ length: 64 }),
    owner_instance: column.varchar({ length: 64 }),
    started_at: column.timestamp(),
    expires_at: column.timestamp(),
  },
  { timestamps: true },
);
