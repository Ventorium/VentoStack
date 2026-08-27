import { column, defineModel } from "@ventostack/database";

/** 链路步骤（LLM 调用 / 工具执行） */
export const AiTraceSpanModel = defineModel(
  "ai_trace_span",
  {
    id: column.varchar({ primary: true, length: 36 }),
    trace_id: column.varchar({ length: 36 }),
    tenant_id: column.varchar({ length: 64 }),
    seq: column.int({ nullable: true }),
    turn_index: column.int({ nullable: true }),
    span_type: column.varchar({ length: 16 }),
    name: column.varchar({ length: 128 }),
    category: column.varchar({ length: 24, nullable: true }),
    status: column.varchar({ length: 16 }),
    input: column.json({ nullable: true }),
    output: column.json({ nullable: true }),
    error: column.text({ nullable: true }),
    started_at: column.timestamp({ nullable: true }),
    ended_at: column.timestamp({ nullable: true }),
    duration_ms: column.int({ nullable: true }),
  },
  { timestamps: false },
);
