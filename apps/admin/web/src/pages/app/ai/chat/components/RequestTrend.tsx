/**
 * 请求序列的上下文规模趋势
 *
 * 两种读法（对齐 dsh-context 的趋势卡 total/delta 切换）：
 *  - 累计：每次请求的七分桶堆叠面积 —— 上下文「由什么构成、什么时候涨的」
 *  - 增量：相对上一次请求的分桶净变化，零轴上下发散 —— 「这一轮到底加了什么」
 * 并叠加压缩/裁剪事件的净释放标记。
 *
 * 主题：ECharts 不会自动跟随 antd 主题，坐标轴/图例/提示框颜色全部取 token，
 * 否则深色模式下是「深底深字」看不见。
 */
import { useState } from "react";
import ReactECharts from "echarts-for-react";
import { Empty, Segmented, Spin, theme } from "antd";
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
  const { token } = theme.useToken();
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

  const axisColor = { color: token.colorTextTertiary };
  const option = {
    textStyle: { color: token.colorTextSecondary },
    tooltip: {
      trigger: "axis",
      backgroundColor: token.colorBgElevated,
      borderColor: token.colorBorderSecondary,
      textStyle: { color: token.colorText },
    },
    legend: { bottom: 0, type: "scroll", textStyle: { color: token.colorTextSecondary } },
    grid: { left: 8, right: 8, top: 24, bottom: 48, containLabel: true },
    xAxis: {
      type: "category",
      data: xs,
      boundaryGap: mode === "delta",
      axisLabel: { fontSize: 10, ...axisColor },
      axisLine: { lineStyle: { color: token.colorBorderSecondary } },
    },
    yAxis: {
      type: "value",
      name: "tokens",
      nameTextStyle: axisColor,
      axisLabel: axisColor,
      splitLine: { lineStyle: { color: token.colorSplit } },
    },
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

  // 同类同幅度的重复事件合并计数（每个 run 都会重放一次工具 schema，
  // 不合并的话这里会是「注入 703 · 注入 703 · …」的噪音）
  const merged = new Map<string, number>();
  for (const e of events) {
    const delta = e.deltaTokens ?? 0;
    if (delta === 0) continue;
    const key = `${EVENT_LABEL[e.kind ?? ""] ?? e.kind} ${Math.abs(delta).toLocaleString()}`;
    merged.set(key, (merged.get(key) ?? 0) + 1);
  }
  const summary = [...merged.entries()]
    .slice(0, 6)
    .map(([label, count]) => (count > 1 ? `${label} ×${count}` : label))
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
      <ReactECharts
        // 主题切换时重建实例：ECharts 自己缓存了 canvas，靠 option 变更不一定重绘底色
        key={token.colorBgContainer}
        option={option}
        style={{ height: 280 }}
        notMerge
      />
      {summary && (
        <div className="text-xs text-gray-500 mt-1">近期事件：{summary}</div>
      )}
    </div>
  );
}
