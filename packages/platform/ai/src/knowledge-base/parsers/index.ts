/**
 * 文件解析器入口
 * 根据文件扩展名选择对应的解析器
 */

import { basename, extname } from "node:path";
import { parsePdf } from "./pdf";
import { parseDocx } from "./docx";

export interface ParsedResult {
  markdown: string;
  title: string;
  parser: string;
  sourceFileName: string;
}

/**
 * 解析文件为 Markdown
 * @param buffer 文件内容
 * @param fileName 原始文件名（含扩展名）
 */
export async function parseFile(buffer: Buffer, fileName: string): Promise<ParsedResult> {
  const ext = extname(fileName).toLowerCase();
  const baseName = basename(fileName, ext);

  switch (ext) {
    case ".pdf": {
      const result = await parsePdf(buffer, fileName);
      return {
        markdown: result.content,
        title: result.title ?? baseName,
        parser: "pdf-parse",
        sourceFileName: fileName,
      };
    }

    case ".docx": {
      const result = await parseDocx(buffer, fileName);
      return {
        markdown: result.content,
        title: result.title ?? baseName,
        parser: "mammoth",
        sourceFileName: fileName,
      };
    }

    case ".md":
    case ".txt": {
      const text = buffer.toString("utf-8");
      return {
        markdown: text,
        title: baseName,
        parser: "raw",
        sourceFileName: fileName,
      };
    }

    default:
      throw new Error(`不支持的文件格式: ${ext}`);
  }
}

/** 判断文件是否需要解析（非纯文本格式） */
export function needsParsing(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase();
  return [".pdf", ".docx"].includes(ext);
}
