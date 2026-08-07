/**
 * 旧版 Office 格式转换器
 * DOC / PPT / XLS → 通过 LibreOffice 转换为现代格式 → 递归解析
 */
import { extname, join } from "node:path";
import { mkdir, writeFile, readdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { FileParser, ParseInput, ParseContext, ConvertResult, MdOutput, ParserRegistry } from "../types";

const LEGACY_EXTENSIONS = [".doc", ".ppt", ".xls"];

/** 格式 → 目标转换格式 */
const CONVERT_MAP: Record<string, string> = {
  ".doc": "docx",
  ".ppt": "pptx",
  ".xls": "xlsx",
};

export function createLegacyOfficeParser(registry: ParserRegistry): FileParser {
  return {
    name: "legacy-office",
    extensions: LEGACY_EXTENSIONS,

    canHandle(fileName: string): boolean {
      const ext = extname(fileName).toLowerCase();
      return LEGACY_EXTENSIONS.includes(ext);
    },

    async parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const ext = extname(fileName).toLowerCase();
      const baseName = fileName.replace(/\.[^.]+$/, "");
      const targetFormat = CONVERT_MAP[ext];

      if (!targetFormat) {
        throw new Error(`不支持的旧版 Office 格式: ${ext}`);
      }

      // 创建临时目录
      const tmpDir = join(ctx.tmpDir, `legacy-office-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await mkdir(tmpDir, { recursive: true });

      try {
        // 写入源文件
        const inputPath = join(tmpDir, fileName);
        await writeFile(inputPath, buffer);

        ctx.onProgress?.({
          type: "parse_start",
          fileName,
          message: `LibreOffice 转换中: ${ext} → .${targetFormat}...`,
        });

        // 调用 LibreOffice 转换
        await convertWithLibreOffice(inputPath, tmpDir, targetFormat, ctx);

        // 查找转换后的文件
        const outputFiles = (await readdir(tmpDir)).filter((f) =>
          f.toLowerCase().endsWith(`.${targetFormat}`)
        );

        if (outputFiles.length === 0) {
          throw new Error(
            `LibreOffice 转换失败：未找到 .${targetFormat} 输出文件。` +
            `\n请确认系统已安装 LibreOffice（soffice 命令可用）。`
          );
        }

        // 读取转换结果并递归解析
        const convertedPath = join(tmpDir, outputFiles[0]!);
        const convertedBuffer = await readFile(convertedPath);

        ctx.onProgress?.({
          type: "parse_done",
          fileName,
          message: `LibreOffice 转换完成: ${outputFiles[0]}`,
        });

        // 委托给对应的现代格式解析器
        const modernParser = registry.resolve(`converted.${targetFormat}`);
        if (!modernParser) {
          throw new Error(`找不到 .${targetFormat} 的解析器`);
        }

        const result = await modernParser.parse(
          { buffer: convertedBuffer, fileName: `${baseName}.${targetFormat}` },
          ctx,
        );

        // 追加转换来源信息
        result.metadata.convertedFrom = ext;
        result.metadata.conversionTool = "libreoffice";
        result.parser = `legacy-office→${targetFormat}`;

        // 将源文件信息写入输出
        for (const output of result.outputs) {
          output.content = output.content.replace(
            /^(# .+)$/m,
            `$1\n\n> 原始格式：\`${ext}\`（通过 LibreOffice 转换为 .${targetFormat}）`,
          );
        }

        return result;
      } finally {
        // 清理临时目录
        await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

/**
 * 调用 LibreOffice 进行格式转换
 */
async function convertWithLibreOffice(
  inputPath: string,
  outputDir: string,
  targetFormat: string,
  ctx: ParseContext,
): Promise<void> {
  const loPath = (ctx as unknown as { libreofficePath?: string }).libreofficePath ?? "soffice";

  const proc = Bun.spawn(
    [
      loPath,
      "--headless",
      "--convert-to", targetFormat,
      "--outdir", outputDir,
      inputPath,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000, // 2 分钟超时
    },
  );

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(
      `LibreOffice 转换失败（exit code: ${exitCode}）：\n${stderr}` +
      `\n请确认系统已安装 LibreOffice。`
    );
  }
}
