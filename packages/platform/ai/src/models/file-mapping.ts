import { column, defineModel } from "@ventostack/database";

export const AiFileMappingModel = defineModel(
  "ai_file_mapping",
  {
    id: column.varchar({ primary: true, length: 36 }),
    knowledge_base_id: column.varchar({ length: 36 }),
    source_path: column.varchar({ length: 512, nullable: true }),
    content_path: column.varchar({ length: 512 }),
    title: column.varchar({ length: 255 }),
    parser: column.varchar({ length: 32, nullable: true }),
    source_size: column.bigint({ nullable: true }),
    content_size: column.bigint({ nullable: true }),
    parsed_at: column.timestamp({ nullable: true }),
    tenant_id: column.varchar({ length: 36 }),
    created_by: column.varchar({ length: 36 }),
  },
  { timestamps: true },
);
