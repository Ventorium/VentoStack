/**
 * 单个请求的构成明细（表格展开行）
 *
 * 对齐 dsh-context 的 requestDetail：逐请求给出七分桶的 token 与占比，
 * 并附上本次请求的耗时与提供方上报的真实用量 —— 估算构成与真实用量并排，
 * 才能看出「估算准不准、这一轮实际花了多少」。
 *
 * 主题：颜色走 antd token，深色模式下不出现亮底灰字。
 */
import { Typography, theme } from "antd";
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
  const { token } = theme.useToken();
  const total = composition?.total ?? 0;
  const parts = CATEGORY_ORDER.map((key) => ({
    key,
    value: composition?.[key] ?? 0,
    label: CATEGORY_STYLE[key]?.label ?? key,
    color: CATEGORY_STYLE[key]?.color ?? token.colorTextTertiary,
  }));
  const pct = (v: number) => (total > 0 ? ((v / total) * 100).toFixed(1) : "0.0");
  const actualTotal =
    (actual?.uncachedInputTokens ?? 0) +
    (actual?.outputTokens ?? 0) +
    (actual?.cacheReadTokens ?? 0) +
    (actual?.cacheWriteTokens ?? 0);

  return (
    <div className="px-2 py-1">
      <div
        className="mb-2 flex h-2.5 w-full overflow-hidden rounded"
        style={{ background: token.colorFillQuaternary }}
      >
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
        {parts.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span style={{ color: token.colorTextSecondary }}>{p.label}</span>
            <span className="ml-auto" style={{ color: token.colorTextTertiary }}>
              {(p.value ?? 0).toLocaleString()}
            </span>
            <span className="w-12 text-right" style={{ color: token.colorText }}>
              {pct(p.value)}%
            </span>
          </div>
        ))}
      </div>
      <Typography.Text type="secondary" className="mt-2 block text-xs">
        上下文合计 {total.toLocaleString()} tokens
        {typeof durationMs === "number" ? ` · 本轮耗时 ${durationMs.toLocaleString()} ms` : ""}
        {actualTotal > 0
          ? ` · 提供方上报 ${actualTotal.toLocaleString()} tokens（输入 ${
              actual?.uncachedInputTokens ?? 0
            } / 缓存读 ${actual?.cacheReadTokens ?? 0} / 缓存写 ${
              actual?.cacheWriteTokens ?? 0
            } / 输出 ${actual?.outputTokens ?? 0}）`
          : " · 提供方未上报真实用量"}
      </Typography.Text>
    </div>
  );
}
