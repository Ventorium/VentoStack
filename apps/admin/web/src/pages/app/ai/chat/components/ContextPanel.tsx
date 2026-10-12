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
 */
import { useCallback, useEffect, useState } from "react";
import { Col, Descriptions, Empty, Row, Spin, Statistic, Table, Tabs, Tag } from "antd";
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
  const billed =
    (session?.usage?.uncached ?? 0) +
    (session?.usage?.cacheRead ?? 0) +
    (session?.usage?.cacheWrite ?? 0) +
    (session?.usage?.output ?? 0);

  const requestColumns: ColumnsType<NonNullable<ContextDetail["requests"]>[number]> = [
    { title: "请求", dataIndex: "seq", key: "seq", width: 80, render: (v: number) => `#${v}` },
    { title: "轮次", dataIndex: "turnIndex", key: "turnIndex", width: 70 },
    {
      title: "上下文 tokens",
      key: "total",
      width: 120,
      render: (_v, r) => (r.composition?.total ?? 0).toLocaleString(),
    },
    {
      title: "真实用量",
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
      title: "耗时",
      key: "durationMs",
      width: 110,
      render: (_v, r) => (typeof r.durationMs === "number" ? `${r.durationMs.toLocaleString()} ms` : "-"),
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
      <Row gutter={16} className="mb-4">
        <Col xs={24} md={12}>
          <CompositionCard
            current={session?.current}
            contextWindow={session?.contextWindow}
            hoverKey={hoverKey}
            onHoverKey={setHoverKey}
          />
        </Col>
        <Col xs={8} md={4}>
          <Statistic title="请求步数" value={detail?.requests?.length ?? 0} />
        </Col>
        <Col xs={8} md={4}>
          <Statistic
            title="计费 tokens"
            value={billed}
            formatter={(v) => Number(v ?? 0).toLocaleString()}
          />
        </Col>
        <Col xs={8} md={4}>
          <Statistic title="耗时" value={session?.durationMs ?? 0} suffix="ms" />
        </Col>
      </Row>

      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }} className="mb-4">
        <Descriptions.Item label="会话">{session?.title ?? session?.sessionId ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="模型">{session?.model ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="提供方">{session?.provider ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="开始时间">{fmtDate(session?.startedAt ?? "")}</Descriptions.Item>
        <Descriptions.Item label="运行轮次">{session?.runCount ?? 0}</Descriptions.Item>
      </Descriptions>

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
                <RequestTrend requests={detail?.requests ?? []} events={detail?.events ?? []} />
                <Table
                  rowKey="id"
                  size="small"
                  className="mt-4"
                  columns={requestColumns}
                  dataSource={detail?.requests ?? []}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  scroll={{ x: 1100 }}
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
