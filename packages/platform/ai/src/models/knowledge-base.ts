import { column, defineModel } from "@ventostack/database";

export const AiKnowledgeBaseModel = defineModel(
  "ai_knowledge_base",
  {
    id: column.varchar({ primary: true, length: 36 }),
    name: column.varchar({ length: 128 }),
    description: column.text({ nullable: true }),
    base_path: column.varchar({ length: 512 }),
    tenant_id: column.varchar({ length: 36 }),
    created_by: column.varchar({ length: 36 }),
    status: column.varchar({ length: 16, default: "active" }),
    file_count: column.int({ default: 0 }),
  },
  { timestamps: true },
);
