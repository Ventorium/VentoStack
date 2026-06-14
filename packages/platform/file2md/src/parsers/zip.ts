/**
 * ZIP → Markdown 解析器
 *
 * 递归解压，保留目录层级。
 * 每个文件按对应解析器处理，嵌套 ZIP 最多 maxDepth 层。
 */
import { extname, join, dirname } from "node:path";
import type {
  FileParser, ParseInput, ParseContext, ConvertResult, MdOutput,
} from "../types";
import { readZipEntries } from "./zip-reader";

export function createZipParser(): FileParser {
  return {
    name: "zip",
    extensions: [".zip"],

    canHandle(fileName: string): boolean {
      return fileName.toLowerCase().endsWith(".zip");
    },

    async parse(input: ParseInput, ctx: ParseContext): Promise<ConvertResult> {
      const { buffer, fileName } = input;
      const baseName = fileName.replace(/\.zip$/i, "");
      const warnings: string[] = [];
      const maxDepth = ctx.maxDepth ?? 3;
      const currentDepth = ctx.currentDepth ?? 0;

      if (currentDepth >= maxDepth) {
        warnings.push(`ZIP 嵌套深度达到上限 (${maxDepth})，跳过进一步解压`);
        return {
          sourceFileName: fileName,
          outputs: [{
            relativePath: `${baseName}.md`,
            content: `# ${baseName}\n\n> ZIP 嵌套深度达到上限 (${maxDepth})，已跳过`,
            title: baseName,
          }],
          parser: "zip",
          duration: 0,
          warnings,
          metadata: { depth: currentDepth, skipped: true },
        };
      }

      let entries: Array<{ name: string; data: Buffer }>;
      try {
        entries = readZipEntries(buffer);
      } catch (err) {
        throw new Error(`ZIP 解压失败: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (entries.length === 0) {
        return {
          sourceFileName: fileName,
          outputs: [{
            relativePath: `${baseName}.md`,
            content: `# ${baseName}\n\n> 空的 ZIP 文件`,
            title: baseName,
          }],
          parser: "zip",
          duration: 0,
          warnings: ["空的 ZIP 文件"],
          metadata: { entryCount: 0 },
        };
      }

      const outputs: MdOutput[] = [];
      let processed = 0;
      let skipped = 0;

      // ── 目录树索引 ──
      const treeLines: string[] = [];
      treeLines.push(`# ${baseName}`);
      treeLines.push("");
      treeLines.push(`> 来源文件：\`${fileName}\`（${entries.length} 个条目，嵌套深度 ${currentDepth + 1}/${maxDepth}）`);
      treeLines.push("");
      treeLines.push("---");
      treeLines.push("");
      treeLines.push("## 目录结构");
      treeLines.push("");
      treeLines.push(...buildTreePreview(entries.map((e) => e.name)));
      treeLines.push("");
      treeLines.push("---");
      treeLines.push("");

      // ── 逐文件解析 ──
      const childCtx: ParseContext = {
        ...ctx,
        currentDepth: currentDepth + 1,
      };

      // 动态导入 converter 以避免循环依赖
      // 这里通过 registry 解析子文件
      const { createParserRegistry } = await import("../registry");
      const { registerAllParsers } = await import("./index");
      const subRegistry = createParserRegistry();
      registerAllParsers(subRegistry);

      for (const entry of entries) {
        const entryName = entry.name;
        // 跳过目录条目（以 / 结尾）
        if (entryName.endsWith("/")) continue;
        // 跳过 macOS 资源叉
        if (entryName.startsWith("__MACOSX/")) continue;

        const entryFileName = entryName.split("/").pop() ?? entryName;
        const subDir = dirname(entryName);

        try {
          const parser = subRegistry.resolve(entryFileName);

          if (!parser) {
            warnings.push(`跳过不支持的文件: ${entryName}`);
            skipped++;
            continue;
          }

          ctx.onProgress?.({
            type: "file_start",
            fileName: entryName,
            message: `解析 ZIP 内文件 ${processed + 1}...`,
            progress: { current: processed + 1, total: entries.length },
          });

          const result = await parser.parse(
            { buffer: entry.data, fileName: entryFileName },
            childCtx,
          );

          // 将输出路径加上 ZIP 内的目录前缀
          for (const output of result.outputs) {
            const prefixedPath = subDir && subDir !== "."
              ? join(baseName, subDir, output.relativePath)
              : join(baseName, output.relativePath);
            outputs.push({
              ...output,
              relativePath: prefixedPath,
              content: output.content,
            });
          }

          processed++;
          treeLines.push(`### ${entryName}`);
          treeLines.push(`> 解析器: ${result.parser} | 输出: ${result.outputs.length} 个文件`);
          treeLines.push("");

        } catch (err) {
          const msg = `解析 ${entryName} 失败: ${err instanceof Error ? err.message : String(err)}`;
          warnings.push(msg);
          skipped++;
        }
      }

      // 主文档作为索引
      outputs.unshift({
        relativePath: `${baseName}.md`,
        content: treeLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
        title: baseName,
        metadata: { entryCount: entries.length, processed, skipped },
      });

      return {
        sourceFileName: fileName,
        outputs,
        parser: "zip",
        duration: 0,
        warnings,
        metadata: { entryCount: entries.length, processed, skipped, depth: currentDepth + 1 },
      };
    },
  };
}

/** 构建简化的目录树预览 */
function buildTreePreview(names: string[]): string[] {
  const lines: string[] = [];
  const sorted = [...names].sort();

  for (const name of sorted) {
    if (name.endsWith("/")) {
      lines.push(`- 📁 **${name}**`);
    } else {
      const indent = name.includes("/") ? "  " : "";
      lines.push(`${indent}- 📄 \`${name}\``);
    }
  }
  return lines;
}
