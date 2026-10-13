/**
 * AI 上下文洞察 — 对话内的「上下文」页签
 *
 * 以当前会话（conversation id == agent run 的 sessionId）为口径，展示这一次对话
 * 每次模型请求装配出的上下文。仅超级管理员可见（调试信息，普通账号不应接触）。
 *
 * 四个页签：
 *  - 上下文浏览器：重建任意请求时刻的组装上下文（招牌能力）
 *  - 请求序列：每次模型请求的构成快照
 *  - 上下文事件：注入 / 压缩 / 裁剪
 *  - 文件活动：本会话触碰过的文件
 *
 * 布局：顶部左侧「组成占比」、右侧「统计 + 会话信息」，两者等高；
 * 下方是二级页签。所有面板用 antd Card，深色模式跟随全局主题。
 */
import { useCallback, useEffect, useState } from "react";
import { Col, Empty, Row, Spin, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { client } from "@/api";
import { fmtDate } from "@/utils/fmtDate";
import ContextBrowser from "./ContextBrowser";
import RequestTrend from "./RequestTrend";
import CompositionCard from "./CompositionCard";
import RequestComposition from "./RequestComposition";

import type { ContextDetail } from "./context-detail-types";

interface ContextPanelProps {
  /** 当前会话 id；未选定会话时为空，面板展示引导态 */
  sessionId?: string;
}

const KIND_COLOR: Record<string, string> = {
  read: "blue",
  write: "green",
  search: "purple",
};

export default function ContextPanel({ sessionId }: ContextPanelProps) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ContextDetail | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  /** 联动悬停的分桶：组成占比 / DNA 指纹 / 元素行共享同一个高亮 */
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) {
      setDetail(undefined);
      setNotFound(false);
      return;
    }
    setLoading(true);
    const { data, error } = await client.get("/api/ai/context/sessions/:sessionId", {
      params: { sessionId },
    });
    setLoading(false);
    if (error) {
      setNotFound(true);
      return;
    }
    const d = data as ContextDetail | undefined;
    // 后端对无记录的会话返回 200 + 空详情：空详情的 session.id 为空串，
    // 真实会话必有 UUID id —— 据此区分「未采集」与「有数据」。
    // （不能用 rev：getDetail 的 rev 恒为 0，真实数据也是 0）
    setNotFound(!d?.session?.id);
    setDetail(d);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 未开启采集：后端无记录，这是预期状态而非错误，用引导态而不是「会话不存在」
  if (!sessionId) {
    return (
      <div className="pt-16">
        <Empty description="先选择一个会话，再查看它装配出的上下文" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="pt-16">
        <Empty description="该会话没有上下文记录（未为该 Agent 开启采集，或数据已过期）" />
      </div>
    );
  }

  const session = detail?.session;

  const requestColumns: ColumnsType<NonNullable<ContextDetail["requests"]>[number]> = [
    { title: "请求", dataIndex: "seq", key: "seq", width: 80, render: (v: number) => `#${v}` },
    { title: "轮次", dataIndex: "turnIndex", key: "turnIndex", width: 70 },
    {
      title: (
        <Tooltip title="该请求装配出的上下文估算值（与左上的组成占比同源）">
          <span>上下文 tokens</span>
        </Tooltip>
      ),
      key: "total",
      width: 130,
      render: (_v, r) => (r.composition?.total ?? 0).toLocaleString(),
    },
    {
      title: (
        <Tooltip title="提供方上报的输入+输出 tokens；请求失败或提供方未上报时显示 -">
          <span>真实用量</span>
        </Tooltip>
      ),
      key: "actual",
      width: 120,
      render: (_v, r) => {
        const a = r.actual;
        const t =
          (a?.uncachedInputTokens ?? 0) + (a?.outputTokens ?? 0) + (a?.cacheReadTokens ?? 0) + (a?.cacheWriteTokens ?? 0);
        return t > 0 ? t.toLocaleString() : "-";
      },
    },
    {
      title: (
        <Tooltip title="从发出请求到收到响应的时间；未拿到响应时显示 -">
          <span>耗时</span>
        </Tooltip>
      ),
      key: "durationMs",
      width: 110,
      render: (_v, r) =>
        typeof r.durationMs === "number" ? `${r.durationMs.toLocaleString()} ms` : "-",
    },
  ];

  const fileColumns: ColumnsType<NonNullable<ContextDetail["fileOps"]>[number]> = [
    { title: "序号", dataIndex: "seq", key: "seq", width: 80 },
    { title: "路径", dataIndex: "path", key: "path", ellipsis: true },
    {
      title: "类型",
      dataIndex: "kind",
      key: "kind",
      width: 100,
      render: (v?: string) => <Tag color={KIND_COLOR[v ?? ""]}>{v ?? "-"}</Tag>,
    },
    { title: "工具", dataIndex: "tool", key: "tool", width: 120 },
  ];

  return (
    <div className="h-full min-h-0 overflow-auto py-2">
      {/* align="top"：两列各自按内容高度排列，避免等高拉伸把卡片撑出大片空白 */}
      <Row gutter={[12, 12]} className="mb-3" align="top">
        <Col xs={24} xl={9}>
          <CompositionCard
            current={session?.current}
            contextWindow={session?.contextWindow}
            hoverKey={hoverKey}
            onHoverKey={setHoverKey}
          />
        </Col>
      </Row>

      <Tabs
        items={[
          {
            key: "browser",
            label: "上下文浏览器",
            children: (
              <ContextBrowser
                nodes={detail?.nodes ?? []}
                archive={detail?.archive ?? []}
                requests={detail?.requests ?? []}
                hoverKey={hoverKey}
                onHoverKey={setHoverKey}
              />
            ),
          },
          {
            key: "trend",
            label: "请求序列",
            children: (
              <div>
                <Typography.Text type="secondary" className="mb-2 block text-xs">
                  一行一次模型请求（同一轮对话可能多次）；展开行看该次请求的七分桶构成与真实用量。
                  「上下文 tokens」是估算值，「真实用量」是提供方上报值，两者不混算。
                </Typography.Text>
                <RequestTrend requests={detail?.requests ?? []} events={detail?.events ?? []} />
                <Table
                  rowKey="id"
                  size="small"
                  className="mt-4"
                  columns={requestColumns}
                  dataSource={detail?.requests ?? []}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  scroll={{ x: 640 }}
                  expandable={{
                    // 逐请求构成明细（对齐 dsh-context 的 requestDetail）
                    expandedRowRender: (r) => (
                      <RequestComposition
                        composition={r.composition}
                        durationMs={r.durationMs}
                        actual={r.actual}
                      />
                    ),
                  }}
                />
              </div>
            ),
          },
          {
            key: "events",
            label: `上下文事件 (${detail?.events?.length ?? 0})`,
            // 事件 = 压缩/裁剪/工具 schema 注入等会改变上下文规模的动作
            children: (
              <Table
                rowKey="id"
                size="small"
                dataSource={detail?.events ?? []}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: "序号", dataIndex: "seq", key: "seq", width: 80 },
                  {
                    title: "类型",
                    dataIndex: "kind",
                    key: "kind",
                    width: 100,
                    render: (v?: string) => (
                      <Tag color={v === "compact" ? "orange" : v === "prune" ? "red" : "blue"}>
                        {v ?? "-"}
                      </Tag>
                    ),
                  },
                  { title: "产生者", dataIndex: "producer", key: "producer", width: 140 },
                  {
                    title: "净变化",
                    dataIndex: "deltaTokens",
                    key: "deltaTokens",
                    width: 120,
                    render: (v?: number) => (
                      <span className={v !== undefined && v < 0 ? "text-orange-500" : ""}>
                        {v !== undefined && v > 0 ? "+" : ""}
                        {(v ?? 0).toLocaleString()}
                      </span>
                    ),
                  },
                  {
                    title: "时间",
                    dataIndex: "createdAt",
                    key: "createdAt",
                    width: 180,
                    render: (v?: string) => fmtDate(v ?? ""),
                  },
                ]}
              />
            ),
          },
          {
            key: "files",
            label: `文件活动 (${detail?.fileOps?.length ?? 0})`,
            children: (
              <Table
                rowKey="id"
                size="small"
                dataSource={detail?.fileOps ?? []}
                columns={fileColumns}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 800 }}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
