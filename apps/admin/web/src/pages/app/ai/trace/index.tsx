/** AI 链路追踪 — 会话列表（每行 = 一个对话会话的聚合） */
import { Card, Form, Input, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { NodeIndexOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { Space, Button } from "antd";
import { client } from "@/api";
import type { PaginatedData, TraceConversationItem } from "@/api/types";
import { useTable } from "@/hooks/useTable";
import ActionColumn from "@/components/ActionColumn";
import { fmtDate } from "@/utils/fmtDate";
import TraceToggle from "./components/TraceToggle";

const fetcher = (params: Record<string, unknown>) =>
  client.get("/api/ai/trace/conversations", { query: params }) as Promise<{
    error?: unknown;
    data?: PaginatedData<TraceConversationItem>;
  }>;

const TraceListPage = () => {
  const { loading, data, total, page, pageSize, onSearch, onReset, onPageChange } =
    useTable<TraceConversationItem>(fetcher);
  const [searchForm] = Form.useForm();
  const navigate = useNavigate();

  const columns: ColumnsType<TraceConversationItem> = [
    {
      title: "会话",
      dataIndex: "title",
      key: "title",
      width: 240,
      render: (_: unknown, r: TraceConversationItem) => (
        <Typography.Text ellipsis={{ tooltip: r.title ?? r.id }} className="w-56">
          {r.title ?? <Typography.Text type="secondary">{r.id}</Typography.Text>}
        </Typography.Text>
      ),
    },
    {
      title: "Agent",
      dataIndex: "agentName",
      key: "agentName",
      width: 200,
      render: (_: unknown, r: TraceConversationItem) =>
        r.agentName ? (
          <Typography.Text ellipsis={{ tooltip: r.agentId ?? r.agentName }} className="w-44">
            {r.agentName}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">默认助手</Typography.Text>
        ),
    },
    {
      title: "用户",
      dataIndex: "userName",
      key: "userName",
      width: 160,
      render: (_: unknown, r: TraceConversationItem) => (
        <Typography.Text ellipsis={{ tooltip: r.userId ?? "" }} className="w-36">
          {r.userName ?? "-"}
        </Typography.Text>
      ),
    },
    {
      title: "链路数",
      dataIndex: "traceCount",
      key: "traceCount",
      width: 90,
      sorter: false,
      render: (_: unknown, r: TraceConversationItem) => <Tag>{r.traceCount}</Tag>,
    },
    {
      title: "累计 Tokens",
      dataIndex: "totalTokens",
      key: "totalTokens",
      width: 110,
      render: (_: unknown, r: TraceConversationItem) =>
        r.totalTokens > 0 ? r.totalTokens.toLocaleString() : "-",
    },
    {
      title: "最近活动",
      dataIndex: "lastTraceAt",
      key: "lastTraceAt",
      width: 180,
      render: (_: unknown, r: TraceConversationItem) => fmtDate(r.lastTraceAt),
    },
    {
      title: "操作",
      key: "action",
      width: 130,
      fixed: "right" as const,
      render: (_: unknown, r: TraceConversationItem) => (
        <ActionColumn
          items={[{ label: "查看时间线", onClick: () => navigate(`/app/ai/trace/${r.id}`) }]}
        />
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <NodeIndexOutlined />
          <span>AI 链路追踪</span>
        </Space>
      }
      extra={<TraceToggle />}
    >
      <Form
        form={searchForm}
        layout="inline"
        className="mb-4"
        onFinish={() => {
          const values = searchForm.getFieldsValue() as Record<string, string>;
          // 仅提交非空筛选，避免发送空字符串参数
          const filtered = Object.fromEntries(
            Object.entries(values).filter(([, v]) => v !== undefined && v !== ""),
          );
          onSearch(filtered);
        }}
      >
        <Form.Item name="keyword">
          <Input placeholder="搜索用户消息 / 会话 ID" allowClear className="w-64" />
        </Form.Item>
        <Form.Item name="agentId">
          <Input placeholder="Agent ID" allowClear className="w-48" />
        </Form.Item>
        <Form.Item name="userId">
          <Input placeholder="用户 ID" allowClear className="w-40" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              搜索
            </Button>
            <Button
              onClick={() => {
                searchForm.resetFields();
                onReset();
              }}
            >
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={data}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: onPageChange,
        }}
        scroll={{ x: 1100 }}
      />
    </Card>
  );
};

export default TraceListPage;
