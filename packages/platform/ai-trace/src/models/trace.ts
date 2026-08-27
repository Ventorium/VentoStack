import { column, defineModel } from "@ventostack/database";

/** Agent 运行链路（一次用户消息 → 完整 agent loop） */
export const AiTraceModel = defineModel(
  "ai_trace",
  {
    id: column.varchar({ primary: true, length: 36 }),
    conversation_id: column.varchar({ length: 64 }),
    agent_id: column.varchar({ length: 64, nullable: true }),
    session_id: column.varchar({ length: 64, nullable: true }),
    user_id: column.varchar({ length: 64 }),
    tenant_id: column.varchar({ length: 64 }),
    status: column.varchar({ length: 16 }),
    user_message: column.text({ nullable: true }),
    assistant_preview: column.text({ nullable: true }),
    system_prompt: column.text({ nullable: true }),
    model: column.varchar({ length: 128, nullable: true }),
    meta: column.json({ nullable: true }),
    usage: column.json({ nullable: true }),
    error: column.text({ nullable: true }),
    turn_count: column.int({ nullable: true }),
    tool_count: column.int({ nullable: true }),
    duration_ms: column.int({ nullable: true }),
    started_at: column.timestamp({ nullable: true }),
    ended_at: column.timestamp({ nullable: true }),
  },
  { timestamps: false },
);
