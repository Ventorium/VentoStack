/**
 * 单个请求的构成明细（表格展开行）
 *
 * 对齐 dsh-context 的 requestDetail：逐请求给出七分桶的 token 与占比，
 * 并附上本次请求的耗时与提供方上报的真实用量 —— 估算构成与真实用量并排，
 * 才能看出「估算准不准、这一轮实际花了多少」。
 */
import { CATEGORY_ORDER, CATEGORY_STYLE } from "./category-style";

interface RequestCompositionProps {
  composition?: Record<string, number>;
  durationMs?: number | null;
  actual?: {
    uncachedInputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  } | null;
}

export default function RequestComposition({
  composition,
  durationMs,
  actual,
}: RequestCompositionProps) {
  const total = composition?.total ?? 0;
  const parts = CATEGORY_ORDER.map((key) => ({
    key,
    value: composition?.[key] ?? 0,
    label: CATEGORY_STYLE[key]?.label ?? key,
    color: CATEGORY_STYLE[key]?.color ?? "#999",
  }));
  const pct = (v: number) => (total > 0 ? ((v / total) * 100).toFixed(1) : "0.0");
  const actualTotal =
    (actual?.uncachedInputTokens ?? 0) +
    (actual?.outputTokens ?? 0) +
    (actual?.cacheReadTokens ?? 0) +
    (actual?.cacheWriteTokens ?? 0);

  return (
    <div className="px-2 py-1">
      <div className="flex h-2.5 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-800 mb-2">
        {parts.map((p) =>
          p.value > 0 ? (
            <div
              key={p.key}
              title={`${p.label}：${p.value.toLocaleString()} tokens（${pct(p.value)}%）`}
              className="h-full"
              style={{ width: `${total > 0 ? (p.value / total) * 100 : 0}%`, background: p.color }}
            />
          ) : null,
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: p.color }} />
            <span className="text-gray-600 dark:text-gray-300">{p.label}</span>
            <span className="ml-auto text-gray-500">{(p.value ?? 0).toLocaleString()}</span>
            <span className="w-12 text-right font-medium">{pct(p.value)}%</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        上下文合计 {total.toLocaleString()} tokens
        {typeof durationMs === "number" ? ` · 本轮耗时 ${durationMs.toLocaleString()} ms` : ""}
        {actualTotal > 0
          ? ` · 提供方上报 ${actualTotal.toLocaleString()} tokens（输入 ${
              actual?.uncachedInputTokens ?? 0
            } / 缓存读 ${actual?.cacheReadTokens ?? 0} / 缓存写 ${
              actual?.cacheWriteTokens ?? 0
            } / 输出 ${actual?.outputTokens ?? 0}）`
          : " · 提供方未上报真实用量"}
      </div>
    </div>
  );
}
