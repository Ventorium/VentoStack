/**
 * @ventostack/file2md — 模块工厂
 *
 * 创建 file2md 转换模块实例
 */
import type {
  File2MdConfig, File2MdModule, FileParser,
  ConvertFileOptions, ConvertBatchOptions,
} from "./types";
import { createConverter, type Converter } from "./converter";
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
  };
}
