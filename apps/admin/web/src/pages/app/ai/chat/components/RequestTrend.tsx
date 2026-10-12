/**
 * 请求序列的上下文规模趋势
 *
 * 两种读法（对齐 dsh-context 的趋势卡 total/delta 切换）：
 *  - 累计：每次请求的七分桶堆叠面积 —— 上下文「由什么构成、什么时候涨的」
 *  - 增量：相对上一次请求的分桶净变化，零轴上下发散 —— 「这一轮到底加了什么」
 * 并叠加压缩/裁剪事件的净释放标记。
 */
import { useState } from "react";
import ReactECharts from "echarts-for-react";
import { Empty, Segmented, Spin } from "antd";
import { CATEGORY_ORDER, CATEGORY_STYLE } from "./category-style";

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

const EVENT_LABEL: Record<string, string> = {
  inject: "注入",
  compact: "压缩",
  prune: "裁剪",
  switch: "模型切换",
};

type Mode = "total" | "delta";

export default function RequestTrend({ requests, events, loading }: Props) {
  const [mode, setMode] = useState<Mode>("total");

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

  /** 增量模式：每个分桶给出相对上一次请求的带符号变化 */
  const deltaOf = (index: number, key: string): number => {
    const cur = requests[index]?.composition?.[key] ?? 0;
    const prev = index > 0 ? (requests[index - 1]?.composition?.[key] ?? 0) : 0;
    return cur - prev;
  };

  const option = {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, type: "scroll" },
    grid: { left: 8, right: 8, top: 24, bottom: 48, containLabel: true },
    xAxis: { type: "category", data: xs, boundaryGap: mode === "delta", axisLabel: { fontSize: 10 } },
    yAxis: { type: "value", name: "tokens" },
    series:
      mode === "total"
        ? [
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
          ]
        : [
            // 增量模式用堆叠柱：负值向下、正值向上，一眼看出这一轮加/减了什么
            ...CATEGORY_ORDER.map((key) => ({
              name: CATEGORY_STYLE[key]?.label ?? key,
              type: "bar" as const,
              stack: "delta",
              itemStyle: { color: CATEGORY_STYLE[key]?.color },
              data: requests.map((_r, i) => deltaOf(i, key)),
            })),
          ],
  };

  const summary = events
    .filter((e) => (e.deltaTokens ?? 0) !== 0)
    .slice(0, 6)
    .map((e) => `${EVENT_LABEL[e.kind ?? ""] ?? e.kind} ${Math.abs(e.deltaTokens ?? 0).toLocaleString()}`)
    .join(" · ");

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <Segmented
          size="small"
          value={mode}
          onChange={(v) => setMode(v as Mode)}
          options={[
            { label: "累计构成", value: "total" },
            { label: "本轮增量", value: "delta" },
          ]}
        />
        <span className="text-xs text-gray-500">
          {mode === "total"
            ? "每次请求的上下文构成（堆叠面积）"
            : "相对上一次请求的净变化（零轴上下发散）"}
        </span>
      </div>
      <ReactECharts option={option} style={{ height: 280 }} notMerge />
      {summary && (
        <div className="text-xs text-gray-500 mt-1">近期事件：{summary}</div>
      )}
    </div>
  );
}
