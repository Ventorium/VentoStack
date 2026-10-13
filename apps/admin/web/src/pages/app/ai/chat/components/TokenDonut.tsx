/**
 * Token 统计 — 当前上下文构成环形图
 *
 * 与组成占比的堆叠条同源（同一个 current 快照），两种读法互补：
 * 堆叠条回答「按顺序排开各占多少」，环形图回答「总量是多少、最大头是谁」。
 * 悬停扇区与组成占比 / DNA 指纹 / 元素行联动（共用父级 hoverKey）。
 *
 * 主题：ECharts 不跟随 antd 主题，标签与描边颜色全部取 token。
 */
import ReactECharts from "echarts-for-react";
import { Card, Empty, theme } from "antd";
import { CATEGORY_ORDER, CATEGORY_STYLE } from "./category-style";

interface TokenDonutProps {
  current?: Record<string, number>;
  /** provider 声明的上下文窗口（token）；未知时不显示占用率 */
  contextWindow?: number | null;
  hoverKey?: string | null;
  onHoverKey?: (key: string | null) => void;
}

export default function TokenDonut({
  current,
  contextWindow,
  hoverKey,
  onHoverKey,
}: TokenDonutProps) {
  const { token } = theme.useToken();
  const total = current?.total ?? 0;
  const window = contextWindow && contextWindow > 0 ? contextWindow : null;

  const slices = CATEGORY_ORDER.map((k) => ({
    key: k,
    name: CATEGORY_STYLE[k]?.label ?? k,
    value: current?.[k] ?? 0,
    color: CATEGORY_STYLE[k]?.color ?? token.colorTextTertiary,
  })).filter((s) => s.value > 0);

  const option = {
    tooltip: {
      trigger: "item",
      backgroundColor: token.colorBgElevated,
      borderColor: token.colorBorderSecondary,
      textStyle: { color: token.colorText, fontSize: 12 },
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}：${p.value.toLocaleString()} tokens（${p.percent.toFixed(1)}%）`,
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "82%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: token.colorBgContainer,
          borderWidth: 2,
        },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 6,
        },
        data: slices.map((s) => ({
          name: s.name,
          value: s.value,
          itemStyle: {
            color: s.color,
            // 联动：非当前悬停分桶压暗
            opacity: hoverKey && hoverKey !== s.key ? 0.35 : 1,
          },
        })),
      },
    ],
  };

  return (
    <Card
      size="small"
      title="Token 统计"
      extra={
        <span className="text-xs" style={{ color: token.colorTextTertiary }}>
          当前上下文构成
        </span>
      }
    >
      {total <= 0 ? (
        <div className="h-[180px] flex items-center justify-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无上下文快照" />
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative h-[180px] flex-1">
            <ReactECharts
              option={option}
              style={{ height: "100%", width: "100%" }}
              opts={{ renderer: "svg" }}
            />
            {/* 圆心总计：绝对定位压在图中心，避免 ECharts graphic 与主题脱节 */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold" style={{ color: token.colorText }}>
                {total.toLocaleString()}
              </span>
              <span className="text-xs" style={{ color: token.colorTextTertiary }}>
                {window
                  ? `${((total / window) * 100).toFixed(1)}% / ${(window / 1000).toFixed(0)}k 窗口`
                  : "tokens"}
              </span>
            </div>
          </div>

          {/* 图例：颜色点 + 名称 + tokens + 占比 */}
          <div className="flex w-48 shrink-0 flex-col gap-1">
            {slices.map((s) => {
              const dim = hoverKey != null && hoverKey !== s.key;
              const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0";
              return (
                <div
                  key={s.key}
                  onMouseEnter={() => onHoverKey?.(s.key)}
                  onMouseLeave={() => onHoverKey?.(null)}
                  className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-opacity"
                  style={{ opacity: dim ? 0.5 : 1 }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: s.color }}
                  />
                  <span className="min-w-0 flex-1 truncate" style={{ color: token.colorTextSecondary }}>
                    {s.name}
                  </span>
                  <span style={{ color: token.colorText }}>{s.value.toLocaleString()}</span>
                  <span className="w-11 shrink-0 text-right" style={{ color: token.colorTextTertiary }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
