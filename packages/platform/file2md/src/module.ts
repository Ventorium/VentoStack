/**
 * @ventostack/file2md — 模块工厂
 *
 * 创建 file2md 转换模块实例
 */
import type {
  File2MdConfig, File2MdModule, FileParser, CleanerRule,
  ConvertFileOptions, ConvertBatchOptions,
} from "./types";
import { createConverter, type Converter } from "./converter";
import { createParserRegistry } from "./registry";
import { registerAllParsers } from "./parsers";

export interface File2MdModuleDeps extends File2MdConfig {}

export function createFile2MdModule(deps: File2MdModuleDeps = {}): File2MdModule {
  const converter: Converter = createConverter(deps);

  return {
    async convertFile(
      buffer: Buffer,
      fileName: string,
      options?: ConvertFileOptions,
    ) {
      return converter.convertFile(buffer, fileName, options);
    },

    async convertBatch(
      files: Array<{ buffer: Buffer; fileName: string }>,
      options?: ConvertBatchOptions,
    ) {
      return converter.convertBatch(files, options);
    },

    getSupportedFormats() {
      return converter.getSupportedFormats();
    },

    registerParser(parser: FileParser) {
      converter.getRegistry().register(parser);
    },

    registerRule(_rule: CleanerRule) {
      // 规则在 converter 内部的 cleaner 中管理
      // 这里预留接口，后续可通过 cleaner.addRule 扩展
    },
  };
}
