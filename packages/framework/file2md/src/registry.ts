/**
 * 解析器注册表
 * 根据文件扩展名/MIME 路由到对应解析器
 */
import { extname } from "node:path";
import type { FileParser } from "./types";

export interface ParserRegistry {
  register(parser: FileParser): void;
  resolve(fileName: string, mimeType?: string): FileParser | undefined;
  getSupportedExtensions(): string[];
  list(): FileParser[];
}

export function createParserRegistry(): ParserRegistry {
  const parsers: FileParser[] = [];
  const extensionMap = new Map<string, FileParser>();

  function rebuildIndex(): void {
    extensionMap.clear();
    for (const parser of parsers) {
      for (const ext of parser.extensions) {
        extensionMap.set(ext.toLowerCase(), parser);
      }
    }
  }

  return {
    register(parser: FileParser): void {
      parsers.push(parser);
      rebuildIndex();
    },

    resolve(fileName: string, mimeType?: string): FileParser | undefined {
      const ext = extname(fileName).toLowerCase();
      // 1. 先按扩展名精确匹配
      const byExt = extensionMap.get(ext);
      if (byExt && byExt.canHandle(fileName, mimeType)) return byExt;
      // 2. 遍历所有解析器的 canHandle（兜底 MIME 匹配）
      return parsers.find((p) => p.canHandle(fileName, mimeType));
    },

    getSupportedExtensions(): string[] {
      return [...extensionMap.keys()].sort();
    },

    list(): FileParser[] {
      return [...parsers];
    },
  };
}
