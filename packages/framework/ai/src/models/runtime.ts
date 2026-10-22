import { column, defineModel } from '@ventostack/database';

/** 全局虚拟机宿主（平台管理员维护，不按租户隔离） */
export const AiRuntimeHostModel = defineModel(
  'ai_runtime_host',
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 128 }),
    note: column.varchar({ length: 500, nullable: true }),
    listen_address: column.varchar({ length: 255, nullable: true }),
    base_url: column.varchar({ length: 512, nullable: true }),
    token_cipher: column.text({ nullable: true }),
    source: column.varchar({ length: 16, default: 'manual' }),
    source_key: column.varchar({ length: 64, nullable: true }),
    status: column.varchar({ length: 16, default: 'pending' }),
    enabled: column.boolean({ default: true }),
    version: column.varchar({ length: 64, nullable: true }),
    protocol_version: column.varchar({ length: 64, nullable: true }),
    cpu_total: column.int({ default: 0 }),
    memory_mb_total: column.int({ default: 0 }),
    disk_mb_total: column.int({ default: 0 }),
    max_sandboxes: column.int({ default: 20 }),
    reserved_cpu: column.int({ default: 0 }),
    reserved_memory_mb: column.int({ default: 0 }),
    reserved_disk_mb: column.int({ default: 0 }),
    reserved_inflight_cpu: column.int({ default: 0 }),
    reserved_inflight_memory_mb: column.int({ default: 0 }),
    reserved_inflight_disk_mb: column.int({ default: 0 }),
    usage_json: column.json({ nullable: true }),
    last_checked_at: column.timestamp({ nullable: true }),
    last_online_at: column.timestamp({ nullable: true }),
    latency_ms: column.int({ nullable: true }),
    last_error: column.text({ nullable: true }),
    created_by: column.varchar({ length: 36, nullable: true }),
  },
  { timestamps: true },
);

/** 用户资源上限；max_* 为 0 表示不限制 */
export const AiRuntimeUserQuotaModel = defineModel(
  'ai_runtime_user_quota',
  {
    tenant_id: column.varchar({ length: 36 }),
    user_id: column.varchar({ length: 36 }),
    max_instances: column.int({ default: 0 }),
    max_cpu: column.int({ default: 0 }),
    max_memory_mb: column.int({ default: 0 }),
    max_disk_mb: column.int({ default: 0 }),
    updated_by: column.varchar({ length: 36, nullable: true }),
  },
  { timestamps: true },
);

/** 每用户每 Agent 一台虚拟机 */
export const AiAgentRuntimeModel = defineModel(
  'ai_agent_runtime',
  {
    id: column.varchar({ primary: true, length: 36 }),
    tenant_id: column.varchar({ length: 36 }),
    agent_id: column.varchar({ length: 36 }),
    user_id: column.varchar({ length: 36 }),
    host_id: column.varchar({ length: 36 }),
    sandbox_id: column.varchar({ length: 128, nullable: true }),
    state: column.varchar({ length: 16, default: 'provisioning' }),
    cpu_count: column.int({ default: 2 }),
    memory_mb: column.int({ default: 4096 }),
    disk_mb: column.int({ default: 8192 }),
    max_processes: column.int({ default: 512 }),
    network_enabled: column.boolean({ default: true }),
    last_active_at: column.timestamp({ nullable: true }),
    last_checked_at: column.timestamp({ nullable: true }),
    expires_at: column.timestamp({ nullable: true }),
    last_global_memory_sync_at: column.timestamp({ nullable: true }),
    last_workspace_sync_at: column.timestamp({ nullable: true }),
    idle_notified_at: column.timestamp({ nullable: true }),
    stale_notified_at: column.timestamp({ nullable: true }),
    error: column.text({ nullable: true }),
  },
  { timestamps: true },
);

/** 会话 → 实例 / 本次注入知识库 */
export const AiSessionRuntimeModel = defineModel(
  'ai_session_runtime',
  {
    session_id: column.varchar({ primary: true, length: 64 }),
    tenant_id: column.varchar({ length: 36 }),
    instance_id: column.varchar({ length: 36 }),
    bound_kb_ids: column.json({ nullable: true }),
    kb_dirty: column.boolean({ default: false }),
    last_synced_at: column.timestamp({ nullable: true }),
  },
  { timestamps: true },
);

/** 知识库文件精准同步 manifest */
export const AiRuntimeSessionKbFileModel = defineModel(
  'ai_runtime_session_kb_file',
  {
    tenant_id: column.varchar({ length: 36 }),
    session_id: column.varchar({ length: 64 }),
    kb_id: column.varchar({ length: 36 }),
    path: column.varchar({ length: 1024 }),
    size: column.bigint({ default: 0 }),
    mtime_ms: column.bigint({ default: 0 }),
    sha256: column.varchar({ length: 64 }),
    synced_at: column.timestamp({ nullable: true }),
  },
  { timestamps: false },
);

/** 工作区备份 manifest */
export const AiRuntimeWorkspaceFileModel = defineModel(
  'ai_runtime_workspace_file',
  {
    tenant_id: column.varchar({ length: 36 }),
    instance_id: column.varchar({ length: 36 }),
    path: column.varchar({ length: 1024 }),
    size: column.bigint({ default: 0 }),
    sha256: column.varchar({ length: 64 }),
    backed_up_at: column.timestamp({ nullable: true }),
  },
  { timestamps: false },
);
