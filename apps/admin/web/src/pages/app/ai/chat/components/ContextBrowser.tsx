/**
 * 上下文浏览器
 *
 * dsh-context 的招牌能力：选一个请求，重建「那一刻装配进模型的完整上下文」。
 *
 * 重建规则（对齐 dsh-context types.ts:335）：
 *   节点在请求 R 时存活 ⟺ node.seq < R.seq && (node.goneAtSeq == null || node.goneAtSeq > R.seq)
 * 活跃面(nodes) + 归档(archive) 合起来即可还原任意请求的组装结果。
 *
 * 顶部 DNA 指纹条按模型读取顺序摊开这一刻的组装结果，
 * 点击带子在下方展开该元素全文（系统提示 / 用户消息原文都在这里）。
 */
import { useMemo, useState } from "react";
import { Empty, Segmented, Select, Tag, Tooltip, Typography } from "antd";
import { CATEGORY_STYLE } from "./category-style";
import DnaStrip from "./DnaStrip";
import type { DnaBand } from "./DnaStrip";

interface Node {
  id: string;
  seq: number;
  category?: string;
  name?: string;
  tokens?: number;
  preview?: string;
  /** 完整内容（最长 2 万字符），展开行展示；系统提示 / 用户消息全文在这里 */
  content?: string | null;
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
  /** 与组成占比联动的悬停分桶（由父级持有） */
  hoverKey?: string | null;
  onHoverKey?: (key: string | null) => void;
}

type Filter = "all" | "survived";

export default function ContextBrowser({
  nodes,
  archive,
  requests,
  hoverKey,
  onHoverKey,
}: Props) {
  const [filter, setFilter] = useState<Filter>("survived");
  const [targetSeq, setTargetSeq] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 活跃面 + 归档 合并为一个可重建集合
  const allNodes = useMemo(() => {
    const live = nodes.map((n) => ({ ...n, goneAtSeq: null as number | null }));
    const gone = archive.map((n) => ({ ...n, goneAtSeq: n.goneAtSeq ?? null }));
    return [...live, ...gone].sort((a, b) => a.seq - b.seq);
  }, [nodes, archive]);

  // 目标请求：默认取最后一个（有请求才有上下文快照）
  const effectiveSeq = targetSeq ?? requests[requests.length - 1]?.seq ?? null;
  const currentRequest = requests.find((r) => r.seq === effectiveSeq) ?? null;

  /** 重建某一请求时刻的活跃面 */
  const reconstructed = useMemo(() => {
    if (effectiveSeq === null) return [];
    return allNodes.filter(
      (n) => n.seq < effectiveSeq && (n.goneAtSeq === null || n.goneAtSeq > effectiveSeq),
    );
  }, [allNodes, effectiveSeq]);

  const visible = filter === "survived" ? reconstructed : allNodes;

  const totalTokens = visible.reduce((s, n) => s + (n.tokens ?? 0), 0);

  /**
   * DNA 指纹：模型读取顺序 = 系统提示 → 工具 schema → 消息面按 seq。
   * 工具 schema 在我们的采集里是聚合标量（没有逐工具节点），用请求快照的 tools 值合成一条带。
   */
  const bands = useMemo<DnaBand[]>(() => {
    if (effectiveSeq === null) return [];
    const out: DnaBand[] = [];
    const sys = reconstructed.find((n) => n.category === "system");
    if (sys) out.push({ id: sys.id, label: sys.name ?? "系统提示", category: "system", tokens: sys.tokens ?? 0, expandable: true });
    const toolsTokens = currentRequest?.composition?.tools ?? 0;
    if (toolsTokens > 0) out.push({ id: "band-tools", label: "工具 schema", category: "tools", tokens: toolsTokens });
    for (const n of reconstructed) {
      if (n.category === "system" || n.category === "tools") continue;
      out.push({
        id: n.id,
        label: `${n.name ?? n.category ?? "元素"} #${n.seq}`,
        category: n.category ?? "inject",
        tokens: n.tokens ?? 0,
        expandable: true,
      });
    }
    return out;
  }, [reconstructed, currentRequest, effectiveSeq]);

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
          共 {visible.length} 个节点 · {totalTokens.toLocaleString()} tokens（不含工具 schema）
        </Typography.Text>
      </div>

      {filter === "survived" && (
        <DnaStrip
          bands={bands}
          hoverKey={hoverKey}
          onHoverKey={onHoverKey}
          onSelectBand={(b) => setExpandedId(b.id === expandedId ? null : b.id)}
        />
      )}

      <div className="flex flex-col gap-1 max-h-[520px] overflow-y-auto">
        {visible.map((n) => {
          const style = CATEGORY_STYLE[n.category ?? ""];
          const isGhost = filter === "all" && n.goneAtSeq !== null && n.goneAtSeq !== undefined;
          const isExpanded = n.id === expandedId;
          const isHovered = hoverKey != null && hoverKey === n.category;
          return (
            <div
              key={n.id}
              className={`flex flex-col rounded border border-solid ${
                isHovered
                  ? "border-blue-400 dark:border-blue-500"
                  : "border-gray-200 dark:border-gray-700"
              } ${isGhost ? "opacity-45" : isExpanded ? "bg-gray-50 dark:bg-gray-800" : ""}`}
            >
              {/* 行主体：点击切换展开，展示完整内容（系统提示 / 用户消息全文） */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : n.id)}
                className="flex w-full items-start gap-2 px-2 py-1.5 rounded text-left hover:bg-gray-50 dark:hover:bg-gray-700"
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
                <span className="text-xs text-gray-400 shrink-0 pt-0.5">
                  {isExpanded ? "▲" : "▼"}
                </span>
                {isGhost && (
                  <span className="text-xs text-orange-500 shrink-0 pt-0.5">
                    已被 #{n.goneAtSeq} 移走
                  </span>
                )}
              </button>
              {/* 展开区：完整内容 */}
              {isExpanded && (
                <pre className="m-0 mx-2 mb-2 p-3 rounded bg-gray-100 dark:bg-gray-900 text-xs whitespace-pre-wrap break-all max-h-96 overflow-auto">
                  {n.content && n.content.length > 0 ? n.content : (n.preview ?? "(无内容)")}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
