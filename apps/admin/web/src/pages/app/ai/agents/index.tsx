import { useState, useCallback, useEffect } from "react";
import { Card, Table, Button, Input, Space, Tag, Modal, Form, Select, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { client } from "@/api";
import type { AgentItem, PaginatedData } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import { fmtDate } from "@/utils/fmtDate";
import { useNavigate } from "react-router-dom";

const { TextArea } = Input;

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
  const [data, setData] = useState<AgentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();
  const [modelOptions, setModelOptions] = useState<Array<{ label: string; value: string }>>([]);

  // Fetch models for the create form
  useEffect(() => {
    client.get("/api/ai/models").then(({ data }) => {
      const models = data as Array<{ modelId: string; displayName: string | null; providerName: string }> | undefined;
      if (models?.length) {
        setModelOptions(models.map((m) => ({ label: `${m.providerName}/${m.displayName || m.modelId}`, value: m.modelId })));
      }
    }).catch(() => {});
  }, []);

  const refresh = useCallback(async (p?: number, ps?: number) => {
    setLoading(true);
    try {
      const currentPage = p ?? page;
      const currentPageSize = ps ?? pageSize;
      const query: Record<string, unknown> = { page: currentPage, pageSize: currentPageSize };
      if (searchText) query.name = searchText;
      const { error, data: result } = await client.get("/api/ai/agents", { query }) as {
        error?: unknown; data?: PaginatedData<AgentItem>;
      };
      if (!error && result) {
        setData(result.list);
        setTotal(result.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchText]);

  useEffect(() => { refresh(1); }, []);

  const handleSearch = () => { setPage(1); refresh(1); };
  const handleReset = () => { setSearchText(""); setPage(1); refresh(1, pageSize); };
  const handlePageChange = (p: number, ps: number) => { setPage(p); setPageSize(ps); refresh(p, ps); };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);
      const { error } = await client.post("/api/ai/agents", { body: values });
      if (!error) {
        message.success("创建成功");
        setModalOpen(false);
        form.resetFields();
        refresh(1);
      }
    } catch {} finally {
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
        const { error } = await client.delete("/api/ai/agents/:id", { params: { id: record.id } });
        if (!error) { message.success("删除成功"); refresh(); }
      },
    });
  };

  const handlePublish = async (record: AgentItem) => {
    const { error } = await client.post("/api/ai/agents/:id/publish", { params: { id: record.id } });
    if (!error) { message.success("发布成功"); refresh(); }
  };

  const columns: ColumnsType<AgentItem> = [
    {
      title: "名称", dataIndex: "name", key: "name",
      render: (text: string, record) => (
        <a onClick={() => navigate(`/app/ai/agents/${record.id}`)}>
          <RobotOutlined style={{ marginRight: 8 }} />{text}
        </a>
      ),
    },
    { title: "描述", dataIndex: "description", key: "description", ellipsis: true },
    {
      title: "类型", dataIndex: "type", key: "type", width: 120,
      render: (type: string) => { const t = typeMap[type] || { label: type, color: "default" }; return <Tag color={t.color}>{t.label}</Tag>; },
    },
    { title: "模型", dataIndex: "model", key: "model", width: 120 },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (status: string) => { const s = statusMap[status] || { label: status, color: "default" }; return <Tag color={s.color}>{s.label}</Tag>; },
    },
    {
      title: "公开", dataIndex: "isPublic", key: "isPublic", width: 80,
      render: (isPublic: boolean) => isPublic ? <Tag color="blue">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: "更新时间", dataIndex: "updatedAt", key: "updatedAt", width: 180,
      render: (date: string) => fmtDate(date),
    },
    {
      title: "操作", key: "action", width: 180,
      render: (_, record) => (
        <ActionColumn
          items={[
            { label: "编辑", onClick: () => navigate(`/app/ai/agents/${record.id}`) },
            ...(record.status === "draft" ? [{ label: "发布", onClick: () => handlePublish(record) }] : []),
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
            <Button icon={<ReloadOutlined />} onClick={() => refresh()}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>创建 Agent</Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Input placeholder="搜索 Agent..." prefix={<SearchOutlined />} value={searchText}
            onChange={(e) => setSearchText(e.target.value)} style={{ width: 300 }} onPressEnter={handleSearch} />
          <Button onClick={handleSearch}>搜索</Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, pageSize, total, onChange: handlePageChange }} />
      </Card>

      <Modal title="创建 Agent" open={modalOpen} onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        confirmLoading={modalLoading} okText="创建" cancelText="取消" width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ type: "chatbot" }}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: "请输入 Agent 名称" }]}>
            <Input placeholder="例如：智能客服助手" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <TextArea rows={2} placeholder="Agent 描述（可选）" />
          </Form.Item>
          <Form.Item label="类型" name="type" rules={[{ required: true }]}>
            <Select options={[{ label: "聊天机器人", value: "chatbot" }, { label: "问答助手", value: "qa" }, { label: "数据查询", value: "data_query" }]} />
          </Form.Item>
          <Form.Item label="模型" name="model" rules={[{ required: true }]}>
            <Select options={modelOptions} placeholder="选择模型" showSearch
              filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())} />
          </Form.Item>
          <Form.Item label="系统提示词" name="systemPrompt" rules={[{ required: true, message: "请输入系统提示词" }]}>
            <TextArea rows={4} placeholder="定义 Agent 的行为和能力..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default AgentsPage;
