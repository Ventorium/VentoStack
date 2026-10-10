/**
 * 上下文分类定义（参考 dsh-context/src/client/categories.ts）
 *
 * 每个分类的：显示名、颜色 token、排序权重。
 * 颜色使用 Ant Design 6 preset 色板（蓝/紫/青/橙/绿/金/红），
 * 供前端构成环形图、堆叠条形图、浏览器筛选标签复用。
 */

export interface CategoryMeta {
  key: string;
  label: string;
  color: string;
  /** 排序权重（越小越靠前） */
  order: number;
}

export const CATEGORY_DEFS: CategoryMeta[] = [
  { key: "system", label: "系统提示", color: "#1677ff", order: 1 },
  { key: "tools", label: "工具 schema", color: "#722ed1", order: 2 },
  { key: "user", label: "用户消息", color: "#13c2c2", order: 3 },
  { key: "inject", label: "注入上下文", color: "#fa8c16", order: 4 },
  { key: "skill", label: "技能内容", color: "#52c41a", order: 5 },
  { key: "assistant", label: "助手回复", color: "#2f54eb", order: 6 },
  { key: "tool", label: "工具结果", color: "#f5222d", order: 7 },
];

const CATEGORY_MAP = new Map(CATEGORY_DEFS.map((d) => [d.key, d]));

export function getCategory(key: string): CategoryMeta {
  return CATEGORY_MAP.get(key) ?? { key, label: key, color: "#8c8c8c", order: 99 };
}

export function getCategoryLabel(key: string): string {
  return getCategory(key).label;
}

export function getCategoryColor(key: string): string {
  return getCategory(key).color;
}