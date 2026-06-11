import { column, defineModel } from "@ventostack/database";

export const AiLongTermMemoryModel = defineModel(
  "ai_long_term_memory",
  {
    id: column.varchar({ primary: true, length: 36 }),
    user_id: column.varchar({ length: 36 }),
    file_path: column.varchar({ length: 512 }),
    title: column.varchar({ length: 255 }),
    content_preview: column.text({ nullable: true }),
    tenant_id: column.varchar({ length: 36 }),
  },
  { timestamps: true },
);
