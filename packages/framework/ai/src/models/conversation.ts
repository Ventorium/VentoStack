import { column, defineModel } from "@ventostack/database";

export const AiConversationModel = defineModel(
  "ai_conversation",
  {
    id: column.varchar({ primary: true, length: 36 }),
    agent_id: column.varchar({ length: 36 }),
    user_id: column.varchar({ length: 36 }),
    file_path: column.varchar({ length: 512 }),
    title: column.varchar({ length: 255, nullable: true }),
    status: column.varchar({ length: 16, default: "active" }),
    message_count: column.int({ default: 0 }),
    agent_config_snapshot: column.json({ nullable: true }),
    tenant_id: column.varchar({ length: 36 }),
  },
  { timestamps: true },
);
