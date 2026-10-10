import { column, defineModel } from "@ventostack/database";

/**
 * 上下文会话（一个会话 = 一个 AgentRunContext.sessionId，跨多个 run 聚合）
 *
 * 每次 agent_start 触碰同一 session_id 即合并计数与构成；
 * 活跃上下文构成（current_*）在每次 before_provider_request 时覆盖为最新快照。
 */
export const AiContextSessionModel = defineModel(
  "ai_context_session",
  {
    id: column.varchar({ primary: true, length: 36 }),
    tenant_id: column.varchar({ length: 64 }),
    session_id: column.varchar({ length: 64 }),
    title: column.text({ nullable: true }),
    agent_id: column.varchar({ length: 64, nullable: true }),
    agent_name: column.varchar({ length: 128, nullable: true }),
    user_id: column.varchar({ length: 64, nullable: true }),
    user_name: column.varchar({ length: 128, nullable: true }),
    parent_run_id: column.varchar({ length: 36, nullable: true }),
    run_count: column.int({ nullable: true }),
    model: column.varchar({ length: 128, nullable: true }),
    provider: column.varchar({ length: 64, nullable: true }),
    context_window: column.int({ nullable: true }),
    status: column.varchar({ length: 16 }),
    // 计数（预聚合）
    turn_count: column.int({ nullable: true }),
    step_count: column.int({ nullable: true }),
    inject_count: column.int({ nullable: true }),
    compact_count: column.int({ nullable: true }),
    prune_count: column.int({ nullable: true }),
    skill_count: column.int({ nullable: true }),
    human_input_count: column.int({ nullable: true }),
    answer_count: column.int({ nullable: true }),
    // 当前活跃上下文构成（token 估算）
    current_system: column.int({ nullable: true }),
    current_tools: column.int({ nullable: true }),
    current_user_msgs: column.int({ nullable: true }),
    current_inject: column.int({ nullable: true }),
    current_skill: column.int({ nullable: true }),
    current_assistant: column.int({ nullable: true }),
    current_tool: column.int({ nullable: true }),
    current_total: column.int({ nullable: true }),
    // 累计真实用量（四桶互斥）
    usage_uncached: column.int({ nullable: true }),
    usage_cache_read: column.int({ nullable: true }),
    usage_cache_write: column.int({ nullable: true }),
    usage_output: column.int({ nullable: true }),
    duration_ms: column.int({ nullable: true }),
    last_user: column.text({ nullable: true }),
    started_at: column.timestamp({ nullable: true }),
    ended_at: column.timestamp({ nullable: true }),
    // 增量版本号，客户端据此判断是否需要重取详情
    rev: column.int({ nullable: true }),
  },
  { timestamps: false },
);

/** 每一次模型请求的上下文快照 */
export const AiContextRequestModel = defineModel(
  "ai_context_request",
  {
    id: column.varchar({ primary: true, length: 36 }),
    tenant_id: column.varchar({ length: 64 }),
    session_id: column.varchar({ length: 64 }),
    seq: column.int(),
    turn_index: column.int(),
    model: column.varchar({ length: 128, nullable: true }),
    provider: column.varchar({ length: 64, nullable: true }),
    message_count: column.int({ nullable: true }),
    context_window: column.int({ nullable: true }),
    // 各分桶估算
    comp_system: column.int({ nullable: true }),
    comp_tools: column.int({ nullable: true }),
    comp_user: column.int({ nullable: true }),
    comp_inject: column.int({ nullable: true }),
    comp_skill: column.int({ nullable: true }),
    comp_assistant: column.int({ nullable: true }),
    comp_tool: column.int({ nullable: true }),
    comp_total: column.int({ nullable: true }),
    // 本次请求提供方上报真实用量
    act_uncached: column.int({ nullable: true }),
    act_output: column.int({ nullable: true }),
    act_cache_read: column.int({ nullable: true }),
    act_cache_write: column.int({ nullable: true }),
    duration_ms: column.int({ nullable: true }),
    brief: column.json({ nullable: true }),
    created_at: column.timestamp({ nullable: true }),
  },
  { timestamps: false },
);

/** 上下文变更事件（注入 / 压缩 / 裁剪 / 模型切换） */
export const AiContextEventModel = defineModel(
  "ai_context_event",
  {
    id: column.varchar({ primary: true, length: 36 }),
    tenant_id: column.varchar({ length: 64 }),
    session_id: column.varchar({ length: 64 }),
    seq: column.int(),
    kind: column.varchar({ length: 16 }),
    producer: column.varchar({ length: 128 }),
    delta_tokens: column.int(),
    turn_index: column.int(),
    detail: column.json({ nullable: true }),
    created_at: column.timestamp({ nullable: true }),
  },
  { timestamps: false },
);

/** 上下文中存活的组成元素（Context Browser 数据源） */
export const AiContextNodeModel = defineModel(
  "ai_context_node",
  {
    id: column.varchar({ primary: true, length: 36 }),
    tenant_id: column.varchar({ length: 64 }),
    session_id: column.varchar({ length: 64 }),
    seq: column.int(),
    category: column.varchar({ length: 16 }),
    name: column.varchar({ length: 256 }),
    tokens: column.int(),
    preview: column.text({ nullable: true }),
    content: column.text({ nullable: true }),
    images: column.int({ nullable: true }),
    /** 被移除该节点的事件 seq；NULL = 仍存活 */
    gone_at_seq: column.int({ nullable: true }),
    created_at: column.timestamp({ nullable: true }),
  },
  { timestamps: false },
);

/** 文件操作（read / write / search） */
export const AiContextFileOpModel = defineModel(
  "ai_context_file_op",
  {
    id: column.varchar({ primary: true, length: 36 }),
    tenant_id: column.varchar({ length: 64 }),
    session_id: column.varchar({ length: 64 }),
    seq: column.int(),
    path: column.varchar({ length: 512 }),
    kind: column.varchar({ length: 16 }),
    tool: column.varchar({ length: 64 }),
    err: column.boolean({ nullable: true }),
    added: column.int({ nullable: true }),
    removed: column.int({ nullable: true }),
    detail: column.text({ nullable: true }),
    created_at: column.timestamp({ nullable: true }),
  },
  { timestamps: false },
);