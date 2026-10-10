/**
 * @ventostack/ai-context — 上下文元素分类与文件操作识别
 *
 * 对齐 dsh-context 的 categoryOf / isInjection 判定，但适配 VentoStack 的
 * AgentEventMessage 形状（content 是纯字符串而非 blocks）。
 */

import type { AgentEventMessage } from "@ventostack/ai";
import type { ContextCategory } from "../shared/types";
import type { MessageCategory } from "./fold-types";

/**
 * 技能内容标记。
 *
 * VentoStack 的 skill 加载会走工具通道（`skill` 工具），
 * 其结果体带 `<skill_content name="...">`，据此把 tool 结果重分类为 skill，
 * 避免技能内容藏进 tool 分桶（对齐 dsh-context issue #66 的意图）。
 */
const SKILL_CONTENT_RE = /<skill_content\s+name="([^"]+)"/i;

/** 从内容中解析技能名；无技能标记返回 null */
export function skillNameOf(content: unknown): string | null {
  if (typeof content !== "string") return null;
  const m = SKILL_CONTENT_RE.exec(content);
  return m?.[1] ? m[1] : null;
}

/**
 * 消息面分类判定。
 *
 * - assistant → assistant
 * - tool → 先看是否技能内容（重分类为 skill）
 * - user → 默认 user；命中注入标记时为 inject
 * - system → 不进活跃面（走 systemTokens 信封）
 */
export function messageCategoryOf(
  message: AgentEventMessage,
  toolName?: string,
): MessageCategory {
  if (message.role === "assistant") return "assistant";
  if (message.role === "tool") {
    const name = skillNameOf(message.content);
    if (name || toolName === "skill") return "skill";
    return "tool";
  }
  if (message.role === "system") return "inject";
  return isInjection(message) ? "inject" : "user";
}

/**
 * 注入判定：内容带注入标记（非 user 角色的来源标注）。
 * VentoStack 目前没有 dsh 的 source 结构，此处保留 hook：
 * 未来 agent 可通过 meta.source 标注注入，届时在此识别。
 */
function isInjection(message: AgentEventMessage): boolean {
  const meta = message as AgentEventMessage & {
    source?: { kind?: unknown; form?: unknown };
  };
  const kind = meta.source?.kind;
  if (typeof kind === "string" && kind !== "" && kind !== "user") return true;
  return typeof meta.source?.form === "string";
}

/** 该分类是否为消息面（false 表示信封类 system/tools） */
export function isMessageCategory(c: ContextCategory): c is MessageCategory {
  return c !== "system" && c !== "tools";
}

/** 折叠后的预览文本：折叠空白 + 截断 */
export function previewOf(text: string, limit = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** 估算行数（用于文件操作的行增删） */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split("\n").length;
}