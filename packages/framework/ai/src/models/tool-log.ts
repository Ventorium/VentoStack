import { column, defineModel } from "@ventostack/database";

export const AiToolLogModel = defineModel(
  "ai_tool_log",
  {
    id: column.varchar({ primary: true, length: 36 }),
    conversation_id: column.varchar({ length: 36, nullable: true }),
    message_id: column.varchar({ length: 36, nullable: true }),
    tool_name: column.varchar({ length: 128 }),
    input: column.json({ nullable: true }),
    output: column.json({ nullable: true }),
    status: column.varchar({ length: 16 }),
    duration: column.int({ nullable: true }),
    user_id: column.varchar({ length: 36, nullable: true }),
    tenant_id: column.varchar({ length: 36 }),
  },
  { timestamps: false },
);
