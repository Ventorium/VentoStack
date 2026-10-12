/**
 * DNA 指纹条 — 把「装配进模型的上下文」按模型读取顺序摊成一条带
 *
 * 对齐 dsh-context 的 DNA 模式：一个元素一条带（系统提示 → 工具 schema → 消息面按 seq），
 * 带宽度正比于 token 数，颜色沿用七分类色。它是组成占比的「展开视图」：
 * 占比回答「哪一类占了多少」，指纹回答「具体是哪些东西、按什么顺序被读了」。
 *
 * 交互：悬停某条带高亮同分类（与组成占比联动），点击在浏览器里展开该元素的全文。
 */
import { Tooltip } from "antd";
import { CATEGORY_STYLE } from "./category-style";
import type { CategoryKey } from "./category-style";

export interface DnaBand {
  /** 元素 id（系统/工具 schema 等信封元素用合成 id） */
  id: string;
  label: string;
  category: CategoryKey | string;
  tokens: number;
  /** 点击回调仅对可展开的真实节点有意义 */
  expandable?: boolean;
}

interface DnaStripProps {
  bands: DnaBand[];
  hoverKey?: string | null;
  onHoverKey?: (key: string | null) => void;
  onSelectBand?: (band: DnaBand) => void;
}

export default function DnaStrip({
  bands,
  hoverKey,
  onHoverKey,
  onSelectBand,
}: DnaStripProps) {
  const total = bands.reduce((s, b) => s + b.tokens, 0);
  // 最小带宽 3px：零/极小 token 的元素也要在读取顺序里可见（不撒谎的省略）
  const widthOf = (tokens: number) =>
    total > 0 ? Math.max(3, (tokens / total) * 100) : 100 / Math.max(1, bands.length);

  if (bands.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
          DNA 指纹 · 模型读取顺序
        </span>
        <span className="text-xs text-gray-400">
          {bands.length} 个元素 · {total.toLocaleString()} tokens
        </span>
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded border border-solid border-gray-200 dark:border-gray-700">
        {bands.map((b) => {
          const style = CATEGORY_STYLE[b.category];
          const dim = hoverKey && hoverKey !== b.category;
          return (
            <Tooltip
              key={b.id}
              title={`${b.label}：${b.tokens.toLocaleString()} tokens`}
              mouseEnterDelay={0.15}
            >
              <button
                type="button"
                aria-label={b.label}
                onMouseEnter={() => onHoverKey?.(b.category)}
                onMouseLeave={() => onHoverKey?.(null)}
                onClick={() => (b.expandable ? onSelectBand?.(b) : undefined)}
                className={`h-full shrink-0 p-0 border-0 ${
                  b.expandable ? "cursor-pointer" : "cursor-default"
                }`}
                style={{
                  width: `${widthOf(b.tokens)}%`,
                  background: style?.color ?? "#999",
                  opacity: dim ? 0.35 : 1,
                }}
              />
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
