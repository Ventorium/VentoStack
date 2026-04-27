/**
 * 构建时脚本：将文档加载到知识库并序列化为 JSON
 *
 * 在 `astro build` 之前运行，生成 `src/pages/api/kb-data.json`，
 * 供 API route 导入使用。
 */

import { createKnowledgeBase, loadDocumentsFromDirectory } from "@ventostack/ai";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const DOCS_PATH = "src/content/docs";
const OUTPUT_PATH = "src/pages/api/kb-data.json";

console.log("Loading documents into knowledge base...");

const kb = createKnowledgeBase();
const result = await loadDocumentsFromDirectory(DOCS_PATH, kb, {
  chunkSize: 800,
  overlap: 150,
});

console.log(`Loaded ${result.loaded} documents, ${result.chunks} chunks`);
if (result.errors.length > 0) {
  console.warn("Errors:", result.errors);
}

const docs = kb.list().map((doc) => ({
  id: doc.id,
  content: doc.content,
  metadata: doc.metadata,
}));

const output = join(import.meta.dir, "..", OUTPUT_PATH);
writeFileSync(output, JSON.stringify(docs, null, 2));
console.log(`Knowledge base written to ${OUTPUT_PATH}`);
