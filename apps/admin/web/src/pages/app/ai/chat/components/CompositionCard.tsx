/**
 * 组成占比卡片 — 当前会话上下文构成的七分桶占比
 *
 * 对齐 dsh-context 的 currentComposition：横向堆叠条 + 图例。
 * 每个分桶给出 token 数与占比（%），悬停堆叠条段落在 title 里给出同样信息。
 * 数据来自后端 session.current（system/tools/user/inject/skill/assistant/tool）。
 */
import { CATEGORY_STYLE } from "./category-style";

/** 七个分桶的固定顺序（与后端 CATEGORY_DEFS 一致） */
const CATS = ["system", "tools", "user", "inject", "skill", "assistant", "tool"] as const;

interface CompositionCardProps {
  current?: Record<string, number>;
}

export default function CompositionCard({ current }: CompositionCardProps) {
  const total = current?.total ?? 0;
  const parts = CATS.map((k) => ({
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
          共 {(total ?? 0).toLocaleString()} tokens
        </span>
      </div>

      {/* 堆叠条：每段宽度 = 该桶 / 总量，悬停给出明细 */}
      <div className="flex h-4 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
        {parts.map((p) =>
          p.value > 0 ? (
            <div
              key={p.key}
              title={`${p.label}：${p.value.toLocaleString()} tokens（${
                total > 0 ? ((p.value / total) * 100).toFixed(1) : 0
              }%）`}
              className="h-full"
              style={{ width: `${total > 0 ? (p.value / total) * 100 : 0}%`, background: p.color }}
            />
          ) : null,
        )}
      </div>

      {/* 图例：颜色点 + 标签 + token 数 + 占比 */}
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {parts.map((p) => {
          const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0.0";
          return (
            <div key={p.key} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
              <span className="w-20 shrink-0 text-gray-600 dark:text-gray-300">{p.label}</span>
              <span className="flex-1 text-right text-gray-500">
                {(p.value ?? 0).toLocaleString()}
              </span>
              <span className="w-14 shrink-0 text-right font-medium">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
