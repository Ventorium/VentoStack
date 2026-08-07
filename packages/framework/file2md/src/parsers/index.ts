/**
 * 解析器注册
 */
import type { ParserRegistry } from "../registry";

import { createTextParser } from "./text";
import { createCodeParser } from "./code";
import { createMarkdownParser } from "./markdown";
import { createStructuredParser } from "./structured";
import { createImageParser } from "./image";
import { createDocxParser } from "./docx";
import { createPptxParser } from "./pptx";
import { createXlsxParser } from "./xlsx";
import { createLegacyOfficeParser } from "./legacy-office";
import { createPdfParser } from "./pdf";
import { createZipParser } from "./zip";
import { createHtmlParser } from "./html";
import { createEpubParser } from "./epub";
import { createUnsupportedParser } from "./unsupported";

/**
 * 注册所有内置解析器到注册表
 * 注意：unsupported 必须最后注册（兜底）
 */
export function registerAllParsers(registry: ParserRegistry): void {
  // 1. 精确匹配优先
  registry.register(createMarkdownParser());
  registry.register(createTextParser());
  registry.register(createCodeParser());
  registry.register(createStructuredParser());
  registry.register(createImageParser());

  // 2. 文档格式（需要特定处理）
  registry.register(createDocxParser());
  registry.register(createPptxParser());
  registry.register(createXlsxParser());
  registry.register(createPdfParser());
  registry.register(createHtmlParser());
  registry.register(createEpubParser());
  registry.register(createZipParser());

  // 3. 旧版 Office（依赖现代解析器的注册表，通过 createLegacyOfficeParser 传入）
  // 注意：legacy-office 需要 registry 实例来委托转换后的解析
  // 延迟注册：在需要时通过外部注入

  // 4. 兜底（必须最后）
  registry.register(createUnsupportedParser());
}

export {
  createTextParser,
  createCodeParser,
  createMarkdownParser,
  createStructuredParser,
  createImageParser,
  createDocxParser,
  createPptxParser,
  createXlsxParser,
  createLegacyOfficeParser,
  createPdfParser,
  createZipParser,
  createHtmlParser,
  createEpubParser,
  createUnsupportedParser,
};
