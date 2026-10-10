/**
 * 上下文浏览器
 *
 * dsh-context 的招牌能力：选一个请求，重建「那一刻装配进模型的完整上下文」。
 *
 * 重建规则（对齐 dsh-context types.ts:335）：
 *   节点在请求 R 时存活 ⟺ node.seq < R.seq && (node.goneAtSeq == null || node.goneAtSeq > R.seq)
 * 活跃面(nodes) + 归档(archive) 合起来即可还原任意请求的组装结果。
 */
import { useMemo, useState } from "react";
import { Empty, Segmented, Select, Tag, Tooltip, Typography } from "antd";
import { CATEGORY_STYLE } from "./category-style";

interface Node {
  id: string;
  seq: number;
  category?: string;
  name?: string;
  tokens?: number;
  preview?: string;
  goneAtSeq?: number;
}

interface Request {
  id: string;
  seq: number;
  turnIndex?: number;
  composition?: Record<string, number>;
}

interface Props {
  nodes: Node[];
  archive: Node[];
  requests: Request[];
}

type Filter = "all" | "survived";

export default function ContextBrowser({ nodes, archive, requests }: Props) {
  const [filter, setFilter] = useState<Filter>("survived");
  const [targetSeq, setTargetSeq] = useState<number | null>(null);

  // 活跃面 + 归档 合并为一个可重建集合
  const allNodes = useMemo(() => {
    const live = nodes.map((n) => ({ ...n, goneAtSeq: null as number | null }));
    const gone = archive.map((n) => ({ ...n, goneAtSeq: n.goneAtSeq ?? null }));
    return [...live, ...gone].sort((a, b) => a.seq - b.seq);
  }, [nodes, archive]);

  // 目标请求：默认取最后一个（有请求才有上下文快照）
  const effectiveSeq = targetSeq ?? requests[requests.length - 1]?.seq ?? null;

  /** 重建某一请求时刻的活跃面 */
  const reconstructed = useMemo(() => {
    if (effectiveSeq === null) return [];
    return allNodes.filter(
      (n) => n.seq < effectiveSeq && (n.goneAtSeq === null || n.goneAtSeq > effectiveSeq),
    );
  }, [allNodes, effectiveSeq]);

  const visible = filter === "survived" ? reconstructed : allNodes;

  const totalTokens = visible.reduce((s, n) => s + (n.tokens ?? 0), 0);

  if (requests.length === 0) {
    return <Empty description="该会话还没有模型请求快照" />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Segmented
          size="small"
          options={[
            { label: "该时刻存活", value: "survived" },
            { label: "全部元素", value: "all" },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
        />
        <Select
          size="small"
          style={{ minWidth: 260 }}
          value={effectiveSeq ?? undefined}
          onChange={(v) => setTargetSeq(v)}
          options={requests.map((r) => ({
            value: r.seq,
            label: `第 ${r.turnIndex ?? 0} 轮 · 请求 #${r.seq}（${
              (r.composition?.total ?? 0).toLocaleString()
            } tokens）`,
          }))}
        />
        <Typography.Text type="secondary" className="text-xs">
          共 {visible.length} 个元素 · {totalTokens.toLocaleString()} tokens
        </Typography.Text>
      </div>

      <div className="flex flex-col gap-1 max-h-[520px] overflow-y-auto">
        {visible.map((n) => {
          const style = CATEGORY_STYLE[n.category ?? ""];
          const isGhost = filter === "all" && n.goneAtSeq !== null && n.goneAtSeq !== undefined;
          return (
            <div
              key={n.id}
              className={`flex items-start gap-2 px-2 py-1.5 rounded border border-solid border-gray-200 dark:border-gray-700 ${
                isGhost ? "opacity-45" : ""
              }`}
            >
              <span className="text-xs text-gray-400 w-12 shrink-0 pt-0.5">#{n.seq}</span>
              <Tag
                color={style?.color}
                className="shrink-0 m-0"
                style={{ minWidth: 68, textAlign: "center" }}
              >
                {style?.label ?? n.category}
              </Tag>
              <span className="w-24 shrink-0 text-xs truncate text-gray-500 pt-0.5">
                {n.name ?? "-"}
              </span>
              <Tooltip title={n.preview} placement="topLeft">
                <span className="flex-1 text-xs truncate">{n.preview ?? "(无内容)"}</span>
              </Tooltip>
              <span className="text-xs text-gray-400 shrink-0 pt-0.5">
                {(n.tokens ?? 0).toLocaleString()}
              </span>
              {isGhost && (
                <span className="text-xs text-orange-500 shrink-0 pt-0.5">
                  已被 #{n.goneAtSeq} 移走
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}