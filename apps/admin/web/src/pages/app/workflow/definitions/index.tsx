import { useState } from "react";
import { Card, Table, Button, Input, Form, Modal, Space, Tag, Row, Col, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined } from "@ant-design/icons";
import { client } from "@/api";
import type { WorkflowDefinitionItem } from "@/api/types";
import { useTable } from "@/hooks/useTable";
import ActionColumn from "@/components/ActionColumn";
import { fmtDate } from "@/utils/fmtDate";

const fetcher = (params: Record<string, unknown>) =>
  client.get("/api/workflow/definitions", { query: params }) as Promise<{
    error?: unknown;
    data?: { items: WorkflowDefinitionItem[]; total: number };
  }>;

const DefStatusMap: Record<number, { label: string; color: string }> = {
  0: { label: "草稿", color: "default" },
  1: { label: "已发布", color: "green" },
  2: { label: "已停用", color: "red" },
};

const WorkflowDefinitionsPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<WorkflowDefinitionItem>(fetcher);
  const [searchForm] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkflowDefinitionItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSearch = () => {
    onSearch({ name: searchForm.getFieldValue("name"), status: searchForm.getFieldValue("status") });
  };
  const handleReset = () => {
    searchForm.resetFields();
    onReset();
  };

  const openCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setModalOpen(true);
  };
  const openEdit = (r: WorkflowDefinitionItem) => {
    setEditingItem(r);
    form.setFieldsValue({ name: r.name, code: r.code, description: r.description, category: r.category });
    setModalOpen(true);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    setModalLoading(true);
    try {
      if (editingItem) {
        const { error } = await client.put("/api/workflow/definitions/:id", {
          params: { id: editingItem.id },
          body: values,
        });
        if (!error) {
          message.success("更新成功");
          setModalOpen(false);
          refresh();
        }
      } else {
        const { error } = await client.post("/api/workflow/definitions", { body: values });
        if (!error) {
          message.success("创建成功");
          setModalOpen(false);
          refresh();
        }
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handlePublish = async (id: string) => {
    const { error } = await client.post("/api/workflow/definitions/:id/publish", { params: { id } });
    if (!error) {
      message.success("发布成功");
      refresh();
    }
  };

  const handleDisable = async (id: string) => {
    const { error } = await client.post("/api/workflow/definitions/:id/disable", { params: { id } });
    if (!error) {
      message.success("已停用");
      refresh();
    }
  };

  const handleClone = async (id: string) => {
    const { error } = await client.post("/api/workflow/definitions/:id/clone", { params: { id } });
    if (!error) {
      message.success("克隆成功");
      refresh();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await client.delete("/api/workflow/definitions/:id", { params: { id } });
    if (!error) {
      message.success("删除成功");
      refresh();
    }
  };

  const columns: ColumnsType<WorkflowDefinitionItem> = [
    { title: "名称", dataIndex: "name", key: "name", width: 180 },
    { title: "编码", dataIndex: "code", key: "code", width: 160 },
    { title: "分类", dataIndex: "category", key: "category", width: 100 },
    {
      title: "版本", dataIndex: "version", key: "version", width: 70,
      render: (v: number) => `v${v}`,
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 90,
      render: (_: unknown, r: WorkflowDefinitionItem) => {
        const s = DefStatusMap[r.status] ?? { label: "未知", color: "default" };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 180,
      render: (_: unknown, r: WorkflowDefinitionItem) => fmtDate(r.createdAt),
    },
    {
      title: "操作", key: "action", width: 240, fixed: "right" as const,
      render: (_: unknown, r: WorkflowDefinitionItem) => (
        <ActionColumn
          items={[
            { label: "编辑", onClick: () => openEdit(r) },
            ...(r.status === 0
              ? [
                  { label: "发布", onClick: () => handlePublish(r.id) },
                  { label: "删除", onClick: () => handleDelete(r.id), danger: true, confirm: "确定删除？" },
                ]
              : []),
            ...(r.status === 1
              ? [{ label: "停用", onClick: () => handleDisable(r.id) }]
              : []),
            { label: "克隆", onClick: () => handleClone(r.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <Card>
      <Form form={searchForm} layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item name="name">
          <Input placeholder="流程名称" allowClear />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>搜索</Button>
            <Button onClick={handleReset}>重置</Button>
          </Space>
        </Form.Item>
      </Form>

      <Row style={{ marginBottom: 16 }}>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建流程
          </Button>
        </Col>
      </Row>

      <Table
        rowKey="id"
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
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingItem ? "编辑流程定义" : "新建流程定义"}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="如：请假审批" />
          </Form.Item>
          <Form.Item
            name="code"
            label="编码"
            rules={[{ required: true, message: "请输入编码" }]}
            extra="英文标识，创建后不可修改"
          >
            <Input placeholder="如：leave_approval" disabled={!!editingItem} />
          </Form.Item>
          <Form.Item name="category" label="分类">
            <Input placeholder="如：人事、财务" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default WorkflowDefinitionsPage;
