import { useState } from "react";
import { Card, Table, Button, Input, Space, Tag, message, Modal, Form, Select } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { client } from "@/api";
import type { AgentItem } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import { fmtDate } from "@/utils/fmtDate";
import { useNavigate } from "react-router-dom";

const { TextArea } = Input;

// AI 接口尚未注册到 OpenAPI schema，临时使用 any
const aiClient = client as any;

const fetcher = (params: Record<string, unknown>) =>
  aiClient.get("/api/ai/agents", { query: params }) as Promise<{
    error?: unknown;
    data?: { list: AgentItem[]; total: number };
  }>;

const typeMap: Record<string, { label: string; color: string }> = {
  chatbot: { label: "聊天机器人", color: "blue" },
  qa: { label: "问答助手", color: "green" },
  data_query: { label: "数据查询", color: "orange" },
};

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  active: { label: "已发布", color: "green" },
  disabled: { label: "已停用", color: "red" },
};

const AgentsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ list: AgentItem[]; total: number }>({ list: [], total: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  const refresh = async (params?: Record<string, unknown>) => {
    setLoading(true);
    try {
      const result = await fetcher({ page, pageSize, ...params });
      if (!result.error) {
        setData(result.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    refresh({ name: searchText, page: 1 });
  };

  const handleReset = () => {
    setSearchText("");
    setPage(1);
    refresh({ page: 1 });
  };

  const handlePageChange = (p: number, ps: number) => {
    setPage(p);
    setPageSize(ps);
    refresh({ page: p, pageSize: ps });
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      const { error } = await aiClient.post("/api/ai/agents", { body: values });
      if (!error) {
        message.success("创建成功");
        setModalOpen(false);
        form.resetFields();
        refresh();
      }
    } catch {
      // validation failed
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = (record: AgentItem) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除 Agent「${record.name}」吗？`,
      okText: "删除",
      okType: "danger",
      onOk: async () => {
        const { error } = await aiClient.delete(`/api/ai/agents/${record.id}`);
        if (!error) {
          message.success("删除成功");
          refresh();
        }
      },
    });
  };

  const handlePublish = async (record: AgentItem) => {
    const { error } = await aiClient.post(`/api/ai/agents/${record.id}/publish`);
    if (!error) {
      message.success("发布成功");
      refresh();
    }
  };

  const columns: ColumnsType<AgentItem> = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      render: (text: string, record) => (
        <a onClick={() => navigate(`/app/ai/agents/${record.id}`)}>
          <RobotOutlined style={{ marginRight: 8 }} />
          {text}
        </a>
      ),
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 120,
      render: (type: string) => {
        const t = typeMap[type] || { label: type, color: "default" };
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: "模型",
      dataIndex: "model",
      key: "model",
      width: 120,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => {
        const s = statusMap[status] || { label: status, color: "default" };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "公开",
      dataIndex: "isPublic",
      key: "isPublic",
      width: 80,
      render: (isPublic: boolean) =>
        isPublic ? <Tag color="blue">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: "更新时间",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 180,
      render: (date: string) => fmtDate(date),
    },
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_, record) => (
        <ActionColumn
          items={[
            { label: "编辑", onClick: () => navigate(`/app/ai/agents/${record.id}`) },
            ...(record.status === "draft"
              ? [{ label: "发布", onClick: () => handlePublish(record) }]
              : []),
            { label: "删除", onClick: () => handleDelete(record), danger: true, confirm: "确定删除？" },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <Card
        title="Agent 管理"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refresh()}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setModalOpen(true)}
            >
              创建 Agent
            </Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索 Agent..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
            onPressEnter={handleSearch}
          />
          <Button onClick={handleSearch}>搜索</Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={data?.list}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total: data?.total,
            onChange: handlePageChange,
          }}
        />
      </Card>

      <Modal
        title="创建 Agent"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        confirmLoading={modalLoading}
        okText="创建"
        cancelText="取消"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{
            type: "chatbot",
            model: "gpt-4o-mini",
          }}
        >
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: "请输入 Agent 名称" }]}
          >
            <Input placeholder="例如：智能客服助手" />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <TextArea rows={2} placeholder="Agent 描述（可选）" />
          </Form.Item>

          <Form.Item label="类型" name="type" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "聊天机器人", value: "chatbot" },
                { label: "问答助手", value: "qa" },
                { label: "数据查询", value: "data_query" },
              ]}
            />
          </Form.Item>

          <Form.Item label="模型" name="model" rules={[{ required: true }]}>
            <Select
              options={[
                { label: "GPT-4o", value: "gpt-4o" },
                { label: "GPT-4o Mini", value: "gpt-4o-mini" },
                { label: "Claude 3.5 Sonnet", value: "claude-3-5-sonnet" },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="系统提示词"
            name="systemPrompt"
            rules={[{ required: true, message: "请输入系统提示词" }]}
          >
            <TextArea rows={4} placeholder="定义 Agent 的行为和能力..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default AgentsPage;
