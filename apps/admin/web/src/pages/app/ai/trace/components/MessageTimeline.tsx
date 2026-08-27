/** 会话消息时间线：用户消息 + 助手回复卡片（指标 + 点击加载 trace 详情） */
import { useState } from "react";
import { Card, Collapse, Empty, Spin, Tag, Typography } from "antd";
import { RobotOutlined, UserOutlined } from "@ant-design/icons";
import { client } from "@/api";
import type { TraceDetail, TraceMessageItem } from "@/api/types";
import SpanTimeline from "./SpanTimeline";

const STATUS_META: Record<string, { label: string; color: string }> = {
  running: { label: "进行中", color: "processing" },
  success: { label: "成功", color: "success" },
  error: { label: "错误", color: "error" },
  aborted: { label: "已中止", color: "default" },
  interrupted: { label: "已中断", color: "warning" },
};

function fmtDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** 单条 trace：用户消息 + 助手回复 + 展开的 span 时间线（懒加载） */
function TraceBlock({ item }: { item: TraceMessageItem }) {
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const loadDetail = async () => {
    if (detail || loading) return;
    setLoading(true);
    const { error, data } = await client.get("/api/ai/trace/traces/:traceId", {
      params: { traceId: item.traceId },
    });
    setLoading(false);
    if (!error && data) setDetail(data as TraceDetail);
  };

  const status = STATUS_META[item.status] ?? { label: item.status, color: "default" };

  return (
    <div className="mb-6">
      {/* 用户消息 */}
      <div className="mb-3 flex gap-2">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900">
          <UserOutlined className="text-sm text-blue-600 dark:text-blue-300" />
        </div>
        <Card size="small" className="flex-1">
          <Typography.Paragraph className="m-0 whitespace-pre-wrap break-all text-sm">
            {item.userMessage || <Typography.Text type="secondary">（无用户输入）</Typography.Text>}
          </Typography.Paragraph>
        </Card>
      </div>

      {/* 助手回复 */}
      <div className="mb-2 flex gap-2">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-900">
          <RobotOutlined className="text-sm text-purple-600 dark:text-purple-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Tag color={status.color}>{status.label}</Tag>
            {item.model && <Typography.Text type="secondary" className="text-xs">{item.model}</Typography.Text>}
            <Typography.Text type="secondary" className="text-xs">{item.turnCount} 轮</Typography.Text>
            <Typography.Text type="secondary" className="text-xs">{item.toolCount} 工具</Typography.Text>
            <Typography.Text type="secondary" className="text-xs">{fmtDuration(item.durationMs)}</Typography.Text>
            {item.usage && (
              <Typography.Text type="secondary" className="text-xs">
                {item.usage.totalTokens} tokens
              </Typography.Text>
            )}
            <Typography.Text type="secondary" className="text-xs">{item.startedAt}</Typography.Text>
          </div>
          <Card size="small">
            <Typography.Paragraph className="m-0 whitespace-pre-wrap break-all text-sm">
              {item.assistantPreview ? (
                item.assistantPreview.length >= 200 ? `${item.assistantPreview}…` : item.assistantPreview
              ) : (
                <Typography.Text type="secondary">（无回复内容）</Typography.Text>
              )}
            </Typography.Paragraph>
            <Collapse
              size="small"
              ghost
              className="mt-1"
              items={[
                {
                  key: "spans",
                  label: (
                    <Typography.Link className="text-xs" onClick={loadDetail}>
                      {loading ? <Spin size="small" /> : "查看执行链路"}
                    </Typography.Link>
                  ),
                  children: detail ? <SpanTimeline spans={detail.spans} /> : null,
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function MessageTimeline({ items }: { items: TraceMessageItem[] }) {
  if (items.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该会话暂无追踪记录" />;
  }
  return (
    <div>
      {items.map((item) => (
        <TraceBlock key={item.traceId} item={item} />
      ))}
    </div>
  );
}
