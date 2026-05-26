/**
 * @ventostack/core — 标签日志工具
 *
 * 用于启动阶段、CLI、种子脚本等场景的轻量日志，
 * 统一 `[tag] message` 格式，无需初始化 Logger 实例。
 * 使用 Bun.color 为终端输出着色：tag 蓝色，info 绿色，warn 黄色，error 红色。
 *
 * ```ts
 * const log = createTagLogger("cache");
 * log.info("Using Redis adapter");
 * // → [cache] Using Redis adapter  (tag=蓝色, message=绿色)
 * ```
 */

export interface TagLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    return " " + JSON.stringify(meta);
  } catch {
    return "";
  }
}

import { RESET, ansi, COLORS } from "./color";

/** ANSI 着色：tag 始终紫色 */
const colorTag = (tag: string): string => `${ansi(COLORS.tag)}[${tag}]${RESET}`;

/** 按日志级别着色消息 */
const LEVEL_COLOR: Record<string, string> = {
  info: COLORS.info,
  warn: COLORS.warn,
  error: COLORS.error,
};

function colorize(tag: string, level: string, text: string): string {
  const tagPart = colorTag(tag);
  const msgPart = `${ansi(LEVEL_COLOR[level] ?? "white")}${text}${RESET}`;
  return `${tagPart} ${msgPart}`;
}

/**
 * 创建带标签的轻量日志器
 * @param tag 日志标签，如 "cache"、"migrations"、"seeds"
 */
export function createTagLogger(tag: string): TagLogger {
  return {
    info(message: string, meta?: Record<string, unknown>): void {
      console.log(colorize(tag, "info", `${message}${formatMeta(meta)}`));
    },
    warn(message: string, meta?: Record<string, unknown>): void {
      console.warn(colorize(tag, "warn", `${message}${formatMeta(meta)}`));
    },
    error(message: string, meta?: Record<string, unknown>): void {
      console.error(colorize(tag, "error", `${message}${formatMeta(meta)}`));
    },
  };
}
