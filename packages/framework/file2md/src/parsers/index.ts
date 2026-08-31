/**
 * 解析器注册
 */
import type { ParserRegistry } from "../registry";

import { createNativeParser } from "./native";
import { createFenceParser } from "./fence";
import { createZipParser } from "./zip";
import { createUnsupportedParser } from "./unsupported";

/**
 * 注册所有内置解析器到注册表
 * 顺序：native（Rust 委托）→ fence（文本兜底）→ zip → unsupported（兜底，必须最后）
 */
export function registerAllParsers(registry: ParserRegistry): void {
  registry.register(createNativeParser());
  registry.register(createFenceParser());
  registry.register(createZipParser());
  registry.register(createUnsupportedParser());
}

export {
  createNativeParser,
  createFenceParser,
  createZipParser,
  createUnsupportedParser,
};
