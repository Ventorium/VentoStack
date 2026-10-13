/**
 * 上下文分桶的展示样式
 *
 * 七个分桶与后端 @ventostack/ai-context 的 CATEGORY_DEFS 一一对应；
 * system / tools 是「每轮都带的固定开销」，其余五个是随轮次增长的内容。
 * 颜色集中在这里，避免浏览器、趋势图各自维护一份导致漂移。
 */
export interface CategoryStyle {
  label: string;
  color: string;
  /** 分桶口径说明（悬停组成占比 label 时展示） */
  meaning: string;
}

/** 七个分桶的 key（固定顺序见 CATEGORY_ORDER） */
export type CategoryKey =
  | "system"
  | "tools"
  | "user"
  | "inject"
  | "skill"
  | "assistant"
  | "tool";

/** 分桶展示顺序：信封（system/tools）→ 消息面（按进入上下文的先后） */
export const CATEGORY_ORDER: readonly CategoryKey[] = [
  "system",
  "tools",
  "user",
  "inject",
  "skill",
  "assistant",
  "tool",
];

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  system: { label: "系统提示", color: "#1677ff", meaning: "系统提示全文，每轮请求都带" },
  tools: { label: "工具 schema", color: "#faad14", meaning: "工具的 name / description / parameters 定义" },
  user: { label: "用户消息", color: "#52c41a", meaning: "用户消息（含历史重放）" },
  inject: { label: "注入上下文", color: "#722ed1", meaning: "运行中注入的上下文（工具结果引入新工具等）" },
  skill: { label: "技能内容", color: "#fa541c", meaning: "被识别为技能内容的片段" },
  assistant: { label: "助手回复", color: "#2f54eb", meaning: "助手回复（含工具调用指令）" },
  tool: { label: "工具结果", color: "#13c2c2", meaning: "工具执行结果" },
};
