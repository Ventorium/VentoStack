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
}

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  system: { label: "系统提示", color: "#1677ff" },
  tools: { label: "工具 schema", color: "#faad14" },
  user: { label: "用户消息", color: "#52c41a" },
  inject: { label: "注入上下文", color: "#722ed1" },
  skill: { label: "技能内容", color: "#fa541c" },
  assistant: { label: "助手回复", color: "#2f54eb" },
  tool: { label: "工具结果", color: "#13c2c2" },
};
