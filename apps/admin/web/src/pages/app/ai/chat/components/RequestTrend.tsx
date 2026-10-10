/**
 * 请求序列的上下文规模趋势
 *
 * 堆叠面积图展示每次请求的七分桶构成，并叠加压缩/裁剪事件的净变化标记，
 * 用来回答「上下文什么时候涨的、什么时候被压下去的、压掉的是什么」。
 */
import ReactECharts from "echarts-for-react";
import { Empty, Spin } from "antd";
import { CATEGORY_STYLE } from "./category-style";

interface Request {
  seq: number;
  turnIndex?: number;
  composition?: Record<string, number>;
}

interface Event {
  seq: number;
  kind?: string;
  producer?: string;
  deltaTokens?: number;
}

interface Props {
  requests: Request[];
  events: Event[];
  loading?: boolean;
}

const CATEGORY_ORDER = [
  "system",
  "tools",
  "user",
  "inject",
  "skill",
  "assistant",
  "tool",
] as const;

const EVENT_LABEL: Record<string, string> = {
  inject: "注入",
  compact: "压缩",
  prune: "裁剪",
  switch: "模型切换",
};

export default function RequestTrend({ requests, events, loading }: Props) {
  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Spin />
      </div>
    );
  }
  if (requests.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Empty description="暂无请求序列" />
      </div>
    );
  }

  const xs = requests.map((r) => `#${r.seq}`);
  // 只画有净释放的事件（压缩/裁剪），注入/切换标在顶部
  const releases = events.filter((e) => (e.deltaTokens ?? 0) < 0);
  const marks = releases.map((e) => {
    // 事件发生在 seq 处，用最近的不超过它的请求坐标作锚
    const idx = requests.findIndex((r) => r.seq >= e.seq);
    return {
      xAxis: idx >= 0 ? xs[idx] : xs[xs.length - 1],
      value: Math.abs(e.deltaTokens ?? 0),
    };
  });

  const option = {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, type: "scroll" },
    grid: { left: 8, right: 8, top: 24, bottom: 48, containLabel: true },
    xAxis: { type: "category", data: xs, boundaryGap: false, axisLabel: { fontSize: 10 } },
    yAxis: { type: "value", name: "tokens" },
    series: [
      ...CATEGORY_ORDER.map((key) => ({
        name: CATEGORY_STYLE[key]?.label ?? key,
        type: "line" as const,
        stack: "ctx",
        areaStyle: { opacity: 0.75 },
        itemStyle: { color: CATEGORY_STYLE[key]?.color },
        data: requests.map((r) => r.composition?.[key] ?? 0),
        smooth: true,
      })),
      {
        name: "压缩释放",
        type: "bar" as const,
        yAxisIndex: 0,
        itemStyle: { color: "rgba(250, 140, 22, 0.45)" },
        data: marks.map((m) => m.value),
      },
    ],
  };

  const summary = events
    .filter((e) => (e.deltaTokens ?? 0) !== 0)
    .slice(0, 6)
    .map((e) => `${EVENT_LABEL[e.kind ?? ""] ?? e.kind} ${Math.abs(e.deltaTokens ?? 0).toLocaleString()}`)
    .join(" · ");

  return (
    <div>
      <ReactECharts option={option} style={{ height: 280 }} notMerge />
      {summary && (
        <div className="text-xs text-gray-500 mt-1">近期事件：{summary}</div>
      )}
    </div>
  );
}