/**
 * @ventostack/core — 终端颜色工具
 *
 * 基于 Bun.color 封装 ANSI 着色能力，统一框架内颜色定义。
 */

/** 重置 ANSI 颜色 */
export const RESET = "\x1b[0m";

/** 预定义颜色 */
export const COLORS = {
  /** 标签/品牌色 — 紫色 */
  tag: "#8d179d",
  /** 信息/链接色 — 绿色 */
  info: "#26c826",
  /** 警告色 — 黄色 */
  warn: "yellow",
  /** 错误色 — 红色 */
  error: "red",
} as const;

/** 解析颜色值为 ANSI 256 转义码 */
export function ansi(color: string): string {
  return Bun.color(color, "ansi-256") ?? "";
}
