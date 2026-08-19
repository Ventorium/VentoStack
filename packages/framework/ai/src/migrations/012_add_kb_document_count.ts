/**
 * 补齐 ai_knowledge_base.document_count 列
 *
 * DB 版知识库服务（createKnowledgeBaseCrudService / kb-scope）的 SQL 使用 document_count，
 * 但 003 建表仅定义了 file_count。此处补齐该列，保证 DB 版服务可执行且与 file_count 语义一致。
 */
import type { Migration } from "@ventostack/database";

export const addKbDocumentCount: Migration = {
  name: "012_add_kb_document_count",
  up: async (executor) => {
    await executor(`
      ALTER TABLE ai_knowledge_base
      ADD COLUMN IF NOT EXISTS document_count INT DEFAULT 0
    `);
  },
  down: async (executor) => {
    await executor(`ALTER TABLE ai_knowledge_base DROP COLUMN IF EXISTS document_count`);
  },
};
