import { column, defineModel } from "@ventostack/database";

export const AiMessageModel = defineModel(
  "ai_message",
  {
    id: column.varchar({ primary: true, length: 36 }),
    conversation_id: column.varchar({ length: 36 }),
    role: column.varchar({ length: 16 }),
    content_preview: column.text({ nullable: true }),
    token_count: column.int({ default: 0 }),
    tenant_id: column.varchar({ length: 36 }),
  },
  { timestamps: false },
);
