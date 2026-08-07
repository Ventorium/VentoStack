import { column, defineModel } from "@ventostack/database";

export const AiDocumentModel = defineModel(
  "ai_document",
  {
    id: column.varchar({ primary: true, length: 36 }),
    knowledge_base_id: column.varchar({ length: 36 }),
    title: column.varchar({ length: 255 }),
    path: column.varchar({ length: 512 }),
    content: column.text(),
    frontmatter: column.json({ nullable: true }),
    links: column.json({ nullable: true }),
    tenant_id: column.varchar({ length: 36 }),
    created_by: column.varchar({ length: 36 }),
    created_at: column.timestamp({ default: "NOW" }),
    updated_at: column.timestamp({ default: "NOW" }),
  },
  { timestamps: true },
);
