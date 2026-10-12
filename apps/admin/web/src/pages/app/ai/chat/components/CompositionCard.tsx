/**
 * 组成占比卡片 — 当前会话上下文构成的七分桶占比
 *
 * 对齐 dsh-context 的 currentComposition：横向堆叠条 + 图例，
 * 并在 provider 声明了上下文窗口时给出「已用 X / 窗口 Y（pct%）」的占用率。
 * 每个分桶给出 token 数与占比（%）；悬停堆叠条段或图例行会高亮同一分桶
 * （联动上下文浏览器里同分类的元素行）。
 */
import { CATEGORY_ORDER, CATEGORY_STYLE } from "./category-style";

interface CompositionCardProps {
  current?: Record<string, number>;
  /** provider 声明的上下文窗口（token）；未知时传 null，不显示占用率 */
  contextWindow?: number | null;
  /** 当前悬停的分桶 key（由父级持有，用于与其它视图联动） */
  hoverKey?: string | null;
  onHoverKey?: (key: string | null) => void;
}

export default function CompositionCard({
  current,
  contextWindow,
  hoverKey,
  onHoverKey,
}: CompositionCardProps) {
  const total = current?.total ?? 0;
  const window = contextWindow && contextWindow > 0 ? contextWindow : null;
  const pct = (v: number) => (total > 0 ? ((v / total) * 100).toFixed(1) : "0.0");
  const parts = CATEGORY_ORDER.map((k) => ({
    key: k,
    value: current?.[k] ?? 0,
    label: CATEGORY_STYLE[k]?.label ?? k,
    color: CATEGORY_STYLE[k]?.color ?? "#999",
  }));

  return (
    <div className="rounded-lg border border-solid border-gray-200 dark:border-gray-700 p-3 h-full">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-medium">组成占比</span>
        <span className="text-xs text-gray-500">
          共 {(total ?? 0).toLocaleString()}
          {window ? ` / ${window.toLocaleString()}` : ""} tokens
          {window ? ` · ${((total / window) * 100).toFixed(1)}% 已用` : ""}
        </span>
      </div>

      {/* 堆叠条：每段宽度 = 该桶 / 总量，悬停给出明细并与图例联动 */}
      <div className="flex h-4 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
        {parts.map((p) =>
          p.value > 0 ? (
            <div
              key={p.key}
              title={`${p.label}：${p.value.toLocaleString()} tokens（${pct(p.value)}%）`}
              onMouseEnter={() => onHoverKey?.(p.key)}
              onMouseLeave={() => onHoverKey?.(null)}
              className="h-full cursor-default"
              style={{
                width: `${total > 0 ? (p.value / total) * 100 : 0}%`,
                background: p.color,
                opacity: hoverKey && hoverKey !== p.key ? 0.35 : 1,
              }}
            />
          ) : null,
        )}
      </div>

      {/* 图例：颜色点 + 标签 + token 数 + 占比 */}
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {parts.map((p) => {
          const dim = hoverKey && hoverKey !== p.key;
          return (
            <div
              key={p.key}
              onMouseEnter={() => onHoverKey?.(p.key)}
              onMouseLeave={() => onHoverKey?.(null)}
              className={`flex items-center gap-2 text-xs rounded px-1 ${
                hoverKey === p.key ? "bg-gray-100 dark:bg-gray-800" : ""
              } ${dim ? "opacity-50" : ""}`}
            >
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
              <span className="w-20 shrink-0 text-gray-600 dark:text-gray-300">{p.label}</span>
              <span className="flex-1 text-right text-gray-500">
                {(p.value ?? 0).toLocaleString()}
              </span>
              <span className="w-14 shrink-0 text-right font-medium">{pct(p.value)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
