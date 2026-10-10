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

interface Detail {
  session?: {
    sessionId?: string;
    title?: string;
    model?: string;
    provider?: string;
    status?: string;
    durationMs?: number;
    startedAt?: string;
    counts?: Record<string, number>;
    usage?: Record<string, number>;
    current?: Record<string, number>;
  };
  requests?: Array<{
    id: string;
    seq: number;
    turnIndex?: number;
    composition?: Record<string, number>;
    actual?: { uncachedInputTokens?: number; outputTokens?: number };
    durationMs?: number;
    createdAt?: string;
  }>;
  events?: Array<{
    id: string;
    seq: number;
    kind?: string;
    producer?: string;
    deltaTokens?: number;
    turnIndex?: number;
    createdAt?: string;
  }>;
  nodes?: Array<{
    id: string;
    seq: number;
    category?: string;
    name?: string;
    tokens?: number;
    preview?: string;
  }>;
  archive?: Array<{
    id: string;
    seq: number;
    category?: string;
    name?: string;
    tokens?: number;
    preview?: string;
    goneAtSeq?: number;
  }>;
  fileOps?: Array<{
    id: string;
    seq: number;
    path?: string;
    kind?: string;
    tool?: string;
    err?: boolean;
    added?: number;
    removed?: number;
    createdAt?: string;
  }>;
}

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
  const [detail, setDetail] = useState<Detail | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);

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
    setNotFound(false);
    setDetail(data as Detail | undefined);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 未开启采集：后端无记录，这是预期状态而非错误，用引导态而不是「会话不存在」
  if (!sessionId) {
    return <Empty description="先选择一个会话，再查看它装配出的上下文" />;
  }

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (notFound) {
    return <Empty description="该会话没有上下文记录（未为该 Agent 开启采集，或数据已过期）" />;
  }

  const session = detail?.session;
  const billed =
    (session?.usage?.uncachedInputTokens ?? 0) +
    (session?.usage?.cachedInputTokens ?? 0) +
    (session?.usage?.cacheCreationInputTokens ?? 0) +
    (session?.usage?.outputTokens ?? 0);

  const requestColumns: ColumnsType<NonNullable<Detail["requests"]>[number]> = [
    { title: "请求", dataIndex: "seq", key: "seq", width: 80, render: (v: number) => `#${v}` },
    { title: "轮次", dataIndex: "turnIndex", key: "turnIndex", width: 70 },
  ];

  const fileColumns: ColumnsType<NonNullable<Detail["fileOps"]>[number]> = [
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
        <Col xs={12} md={6}>
          <Statistic title="当前上下文" value={session?.current?.total ?? 0} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="请求步数" value={session?.counts?.steps ?? 0} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic
            title="计费 tokens"
            value={billed}
            formatter={(v) => Number(v ?? 0).toLocaleString()}
          />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="耗时" value={session?.durationMs ?? 0} suffix="ms" />
        </Col>
      </Row>

      <Descriptions size="small" column={{ xs: 1, sm: 2, md: 4 }} className="mb-4">
        <Descriptions.Item label="会话">{session?.title ?? session?.sessionId ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="模型">{session?.model ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="提供方">{session?.provider ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="开始时间">{fmtDate(session?.startedAt ?? "")}</Descriptions.Item>
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
