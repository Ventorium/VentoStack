import { useState } from "react";
import { Card, Table, Button, Input, Space, Tag, message, Modal, Form } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  FolderOutlined,
  FileOutlined,
} from "@ant-design/icons";
import { client } from "@/api";
import type { KnowledgeBaseItem } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import { fmtDate } from "@/utils/fmtDate";
import { useNavigate } from "react-router-dom";

const { TextArea } = Input;

// AI 接口尚未注册到 OpenAPI schema，临时使用 any
const aiClient = client as any;

const fetcher = (params: Record<string, unknown>) =>
  aiClient.get("/api/ai/knowledge-bases", { query: params }) as Promise<{
    error?: unknown;
    data?: { list: KnowledgeBaseItem[]; total: number };
  }>;

const KnowledgeBasesPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ list: KnowledgeBaseItem[]; total: number }>({ list: [], total: 0 });
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
      const { error } = await aiClient.post("/api/ai/knowledge-bases", { body: values });
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

  const handleDelete = (record: KnowledgeBaseItem) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定要删除知识库「${record.name}」吗？此操作不可恢复。`,
      okText: "删除",
      okType: "danger",
      onOk: async () => {
        const { error } = await aiClient.delete(`/api/ai/knowledge-bases/${record.id}`);
        if (!error) {
          message.success("删除成功");
          refresh();
        }
      },
    });
  };

  const columns: ColumnsType<KnowledgeBaseItem> = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      render: (text: string, record) => (
        <a onClick={() => navigate(`/app/ai/knowledge-bases/${record.id}`)}>
          <FolderOutlined style={{ marginRight: 8 }} />
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
      title: "文件数",
      dataIndex: "fileCount",
      key: "fileCount",
      width: 100,
      render: (count: number) => (
        <Tag icon={<FileOutlined />}>{count}</Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => (
        <Tag color={status === "active" ? "green" : "default"}>
          {status === "active" ? "活跃" : status}
        </Tag>
      ),
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
      width: 120,
      render: (_, record) => (
        <ActionColumn
          items={[
            { label: "详情", onClick: () => navigate(`/app/ai/knowledge-bases/${record.id}`) },
            { label: "删除", onClick: () => handleDelete(record), danger: true, confirm: "确定删除？" },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <Card
        title="知识库管理"
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
              创建知识库
            </Button>
          </Space>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索知识库..."
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
        title="创建知识库"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        confirmLoading={modalLoading}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: "请输入知识库名称" }]}
          >
            <Input placeholder="例如：产品文档" />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <TextArea rows={3} placeholder="知识库描述（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default KnowledgeBasesPage;
