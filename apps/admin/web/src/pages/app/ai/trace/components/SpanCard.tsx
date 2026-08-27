/** 单个 span 卡片：类型图标 / 分类 Tag / 名称 / 状态 / 耗时 + 展开 input/output */
import { useState } from "react";
import { Card, Descriptions, Tag, Typography } from "antd";
import type { TraceSpanItem } from "@/api/types";
import JsonView from "./JsonView";

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  llm: { label: "LLM", color: "geekblue" },
  knowledge_base: { label: "知识库", color: "green" },
  mcp: { label: "MCP", color: "purple" },
  builtin: { label: "内置工具", color: "blue" },
};

const STATUS_COLOR: Record<string, string> = {
  running: "processing",
  success: "success",
  error: "error",
  aborted: "default",
  interrupted: "warning",
};

function fmtDuration(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function stopReasonColor(reason: unknown): string | undefined {
  switch (reason) {
    case "stop": return "green";
    case "tool_calls": return "blue";
    case "length": return "orange";
    case "error": return "red";
    case "aborted": return "default";
    default: return undefined;
  }
}

export default function SpanCard({ span }: { span: TraceSpanItem }) {
  const [open, setOpen] = useState(false);
  const category = span.category ? CATEGORY_META[span.category] : undefined;
  const output = span.output;
  const stopReason = output ? (output.stopReason as string | undefined) : undefined;

  return (
    <Card
      size="small"
      className="mb-2"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Typography.Text className="text-xs" type="secondary">#{span.seq}</Typography.Text>
          <Typography.Text strong className="text-sm">Turn {span.turnIndex}</Typography.Text>
          <Typography.Text className="text-sm">{span.name}</Typography.Text>
          {category && <Tag color={category.color} className="m-0">{category.label}</Tag>}
          <Tag color={STATUS_COLOR[span.status]} className="m-0">{span.status}</Tag>
          {stopReason !== undefined && (
            <Tag color={stopReasonColor(stopReason)} className="m-0">stop: {stopReason}</Tag>
          )}
          <Typography.Text type="secondary" className="text-xs">
            {span.spanType === "llm" ? "LLM 调用" : "工具执行"} · {fmtDuration(span.durationMs)}
          </Typography.Text>
        </span>
      }
      extra={
        <Typography.Link className="text-xs" onClick={() => setOpen(!open)}>
          {open ? "收起" : "详情"}
        </Typography.Link>
      }
    >
      {span.error && (
        <Typography.Paragraph type="danger" className="m-0 text-xs">
          {span.error}
        </Typography.Paragraph>
      )}
      {open && (
        <Descriptions
          size="small"
          column={1}
          bordered
          items={[
            {
              key: "input",
              label: span.spanType === "llm" ? "Prompt（本轮新增）" : "参数",
              children: <JsonView value={span.input ?? (span.spanType === "llm" ? { newMessages: [] } : { args: {} })} />,
            },
            {
              key: "output",
              label: span.spanType === "llm" ? "响应" : "结果",
              children: <JsonView value={output} />,
            },
            {
              key: "time",
              label: "时间",
              children: (
                <Typography.Text className="text-xs">
                  {span.startedAt} → {span.endedAt ?? "进行中"}
                </Typography.Text>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
