/**
 * 组成占比卡片 — 当前会话上下文构成的七分桶占比
 *
 * 对齐 dsh-context 的 currentComposition：横向堆叠条 + 图例，
 * 并在 provider 声明了上下文窗口时给出「已用 X / 窗口 Y（pct%）」的占用率。
 * 悬停堆叠条段或图例行会高亮同一分桶（联动上下文浏览器里同分类的元素行）。
 *
 * 主题：外层用 antd Card、文本用 Typography/token，深色模式跟随全局主题，
 * 不额外维护一套 dark: 色板（分类色是语义色，两种模式下保持同一色相）。
 */
import { Card, Tooltip, Typography, theme } from "antd";
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
  const { token } = theme.useToken();
  const total = current?.total ?? 0;
  const window = contextWindow && contextWindow > 0 ? contextWindow : null;
  const pct = (v: number) => (total > 0 ? ((v / total) * 100).toFixed(1) : "0.0");
  const parts = CATEGORY_ORDER.map((k) => ({
    key: k,
    value: current?.[k] ?? 0,
    label: CATEGORY_STYLE[k]?.label ?? k,
    meaning: CATEGORY_STYLE[k]?.meaning ?? "",
    color: CATEGORY_STYLE[k]?.color ?? token.colorTextTertiary,
  }));

  return (
    <Card
      size="small"
      title={
        <Tooltip
          title={
            <span className="text-xs leading-normal">
              占比按 ~4 字符 ≈ 1 token 的固定密度估算（与参考实现同规则），与「计费 tokens」的提供方上报值口径不同，两者不混算。每个 run 都会重放整段历史，旧节点归档后不计入当前装配。
            </span>
          }
          mouseEnterDelay={0.15}
        >
          <span className="cursor-help">组成占比</span>
        </Tooltip>
      }
      extra={
        <Typography.Text type="secondary" className="text-xs">
          共 {total.toLocaleString()}
          {window ? ` / ${window.toLocaleString()}` : ""} tokens
          {window ? ` · ${((total / window) * 100).toFixed(1)}% 已用` : ""}
        </Typography.Text>
      }
    >
      {/* 堆叠条：每段宽度 = 该桶 / 总量，悬停给出明细并与图例联动 */}
      <div
        className="flex h-4 w-full overflow-hidden rounded"
        style={{ background: token.colorFillQuaternary }}
      >
        {parts.map((p) =>
          p.value > 0 ? (
            <div
              key={p.key}
              title={`${p.label}：${p.value.toLocaleString()} tokens（${pct(p.value)}%）${p.meaning ? ' — ' + p.meaning : ''}`}
              onMouseEnter={() => onHoverKey?.(p.key)}
              onMouseLeave={() => onHoverKey?.(null)}
              className="h-full cursor-default transition-opacity"
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
      <div className="mt-3 flex flex-col gap-1">
        {parts.map((p) => {
          const dim = hoverKey != null && hoverKey !== p.key;
          const active = hoverKey === p.key;
          return (
            <div
              key={p.key}
              onMouseEnter={() => onHoverKey?.(p.key)}
              onMouseLeave={() => onHoverKey?.(null)}
              className="flex items-center gap-2 rounded px-1.5 py-0.5 text-xs transition-colors"
              style={{
                background: active ? token.colorFillQuaternary : undefined,
                opacity: dim ? 0.5 : 1,
              }}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
              <Tooltip title={p.meaning} mouseEnterDelay={0.15}>
                <span style={{ color: token.colorTextSecondary }} className="w-20 shrink-0">
                  {p.label}
                </span>
              </Tooltip>
              <span className="flex-1 text-right" style={{ color: token.colorTextTertiary }}>
                {(p.value ?? 0).toLocaleString()}
              </span>
              <span
                className="w-14 shrink-0 text-right"
                style={{ color: p.value > 0 ? token.colorText : token.colorTextQuaternary }}
              >
                {pct(p.value)}%
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
