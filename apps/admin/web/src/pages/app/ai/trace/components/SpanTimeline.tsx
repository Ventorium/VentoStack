/**
 * Span 时间线：按 turn 分组渲染 SpanCard，头部附耗时条形对比
 * （条形宽度为运行时计算的动态百分比，允许 style）
 */
import { Empty, Typography } from "antd";
import type { TraceSpanItem } from "@/api/types";
import SpanCard from "./SpanCard";

const BAR_COLORS: Record<string, string> = {
  llm: "#1677ff",
  tool: "#722ed1",
};

function groupByTurn(spans: TraceSpanItem[]): Map<number, TraceSpanItem[]> {
  const groups = new Map<number, TraceSpanItem[]>();
  for (const span of spans) {
    const list = groups.get(span.turnIndex) ?? [];
    list.push(span);
    groups.set(span.turnIndex, list);
  }
  return groups;
}

export default function SpanTimeline({ spans }: { spans: TraceSpanItem[] }) {
  if (spans.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无执行步骤" />;
  }
  const maxDuration = Math.max(...spans.map((s) => s.durationMs ?? 0), 1);
  const groups = groupByTurn(spans);

  return (
    <div>
      {/* 耗时条形对比图 */}
      <div className="mb-4 rounded border border-solid border-gray-200 p-3 dark:border-gray-700">
        <Typography.Text type="secondary" className="mb-2 block text-xs">
          耗时对比（最长 {maxDuration < 1000 ? `${maxDuration}ms` : `${(maxDuration / 1000).toFixed(2)}s`}）
        </Typography.Text>
        <div className="flex flex-col gap-1">
          {spans.map((span) => {
            const duration = span.durationMs ?? 0;
            const widthPct = Math.max(2, Math.round((duration / maxDuration) * 100));
            const color = BAR_COLORS[span.spanType] ?? "#8c8c8c";
            return (
              <div key={span.id} className="flex items-center gap-2">
                <Typography.Text className="w-40 shrink-0 truncate text-xs" ellipsis={{ tooltip: span.name }}>
                  {span.name}
                </Typography.Text>
                <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded"
                    style={{ width: `${widthPct}%`, backgroundColor: color, minWidth: "4px" }}
                  />
                </div>
                <Typography.Text className="w-16 shrink-0 text-right text-xs" type="secondary">
                  {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
                </Typography.Text>
              </div>
            );
          })}
        </div>
      </div>

      {/* 按 Turn 分组的步骤卡片 */}
      {[...groups.entries()].map(([turnIndex, groupSpans]) => (
        <div key={turnIndex} className="mb-3">
          <Typography.Text strong className="mb-2 block text-sm">
            第 {turnIndex} 轮（{groupSpans.length} 步）
          </Typography.Text>
          {groupSpans.map((span) => (
            <SpanCard key={span.id} span={span} />
          ))}
        </div>
      ))}
    </div>
  );
}
