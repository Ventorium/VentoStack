/**
 * 不支持格式的解析器
 * 音视频 → 提示用户使用 ffmpeg
 * 其他未知 → 提示不支持
 */
import { extname } from "node:path";
import type { FileParser, ParseInput, ParseContext, ConvertResult } from "../types";

const AUDIO_VIDEO_EXTENSIONS = new Set([
  ".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".opus",
  ".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v",
  ".mpeg", ".mpg", ".3gp", ".ts",
]);

export function createUnsupportedParser(): FileParser {
  return {
    name: "unsupported",
    extensions: [],

    canHandle(_fileName: string): boolean {
      return true; // 兜底
    },

    async parse(input: ParseInput, _ctx: ParseContext): Promise<ConvertResult> {
      const { fileName } = input;
      const ext = extname(fileName).toLowerCase();

      if (AUDIO_VIDEO_EXTENSIONS.has(ext)) {
        throw new Error(
          `不支持的文件格式: ${ext}（音视频文件）。请先使用 ffmpeg 等工具转换并提取其中的文字。` +
          `\n示例: ffmpeg -i "${fileName}" -vn -acodec pcm_s16le -ar 16000 output.wav`
        );
      }

      throw new Error(
        `不支持的文件格式: ${ext}。` +
        `\n支持的格式: markdown, 纯文本, 源代码, JSON/YAML/XML/CSV, 图片, ` +
        `DOCX/PPTX/XLSX, DOC/PPT/XLS, PDF, HTML, EPUB, ZIP。` +
        `\n音视频文件请先使用 ffmpeg 提取文字。`
      );
    },
  };
}
