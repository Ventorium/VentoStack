import { client } from "@/api";
import type { NotifyTemplate } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import { msg } from "@/components/GlobalMessage";
import { NOTIFICATION_API } from "@/constants";
import { useTable } from "@/hooks/useTable";
import { cleanParams } from "@/utils/cleanParams";
import { fmtDate } from "@/utils/fmtDate";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";

const fetcher = (params: Record<string, unknown>) =>
  client.get(NOTIFICATION_API.TEMPLATES, { query: cleanParams(params) });

const channelOptions = [
  { label: "邮件", value: "smtp" },
  { label: "短信", value: "sms" },
  { label: "Webhook", value: "webhook" },
];

const channelMap: Record<string, { label: string; color: string }> = {
  smtp: { label: "邮件", color: "blue" },
  sms: { label: "短信", color: "green" },
  webhook: { label: "Webhook", color: "purple" },
};

const NotifyTemplatesPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<NotifyTemplate>(fetcher);
  const [searchForm] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NotifyTemplate | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSearch = () => {
    const values = searchForm.getFieldsValue();
    onSearch(cleanParams(values));
  };
  const handleReset = () => {
    searchForm.resetFields();
    onReset();
  };

  const openCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({ status: 1 });
    setModalOpen(true);
  };
  const openEdit = (r: NotifyTemplate) => {
    setEditingTemplate(r);
    form.setFieldsValue({
      name: r.name,
      code: r.code,
      channel: r.channel,
      title: r.title,
      content: r.content,
      status: r.status,
    });
    setModalOpen(true);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    setModalLoading(true);
    try {
      if (editingTemplate) {
        const { error } = await client.put(NOTIFICATION_API.TEMPLATE_UPDATE, {
          params: { id: editingTemplate.id },
          body: {
            name: values.name,
            channel: values.channel,
            title: values.title,
            content: values.content,
            status: values.status ? 1 : 0,
          },
        });
        if (!error) {
          msg.success("更新成功");
          setModalOpen(false);
          refresh();
        }
      } else {
        const { error } = await client.post(NOTIFICATION_API.TEMPLATE_CREATE, {
          body: {
            name: values.name,
            code: values.code,
            channel: values.channel,
            title: values.title,
            content: values.content,
          },
        });
        if (!error) {
          msg.success("创建成功");
          setModalOpen(false);
          refresh();
        }
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await client.delete(NOTIFICATION_API.TEMPLATE_DELETE, { params: { id } });
    if (!error) {
      msg.success("删除成功");
      refresh();
    }
  };

  const columns: ColumnsType<NotifyTemplate> = [
    { title: "名称", dataIndex: "name", key: "name", width: 150 },
    { title: "编码", dataIndex: "code", key: "code", width: 120 },
    {
      title: "渠道",
      dataIndex: "channel",
      key: "channel",
      width: 100,
      render: (_: unknown, r: NotifyTemplate) => {
        const ch = channelMap[r.channel];
        return ch ? <Tag color={ch.color}>{ch.label}</Tag> : r.channel;
      },
    },
    { title: "标题", dataIndex: "title", key: "title", ellipsis: true },
    { title: "内容", dataIndex: "content", key: "content", ellipsis: true },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (_: unknown, r: NotifyTemplate) => (
        <Tag color={r.status === 1 ? "green" : "red"}>{r.status === 1 ? "启用" : "禁用"}</Tag>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (_: unknown, r: NotifyTemplate) => fmtDate(r.createdAt),
    },
    {
      title: "操作",
      key: "action",
      width: 136,
      fixed: "right" as const,
      render: (_: unknown, r: NotifyTemplate) => (
        <ActionColumn
          items={[
            { label: "编辑", onClick: () => openEdit(r) },
            {
              label: "删除",
              onClick: () => handleDelete(r.id),
              danger: true,
              confirm: "确定删除该模板？",
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">通知模板</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="channel">
            <Select placeholder="渠道" allowClear options={channelOptions} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="type">
            <Input placeholder="类型" prefix={<SearchOutlined />} style={{ width: 200 }} />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              搜索
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
          </Space>
        </Form>
      </Card>
      <Card
        title={`模板列表（${total}）`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增模板
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: onPageChange,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>
      <Modal
        title={editingTemplate ? "编辑模板" : "新增模板"}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnHidden
        width={700}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="名称"
                rules={[{ required: true, message: "请输入模板名称" }]}
              >
                <Input placeholder="如: 欢迎通知" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="code"
                label="编码"
                rules={[{ required: true, message: "请输入模板编码" }]}
              >
                <Input placeholder="如: welcome" disabled={!!editingTemplate} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="channel"
                label="渠道"
                rules={[{ required: true, message: "请选择渠道" }]}
              >
                <Select options={channelOptions} placeholder="选择渠道" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" valuePropName="checked" initialValue={true}>
                <Switch checkedChildren="启用" unCheckedChildren="禁用" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="如: 欢迎 {{username}}" />
          </Form.Item>
          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: "请输入内容" }]}
          >
            <Input.TextArea rows={6} placeholder="如: 您好 {{username}}，欢迎加入..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default NotifyTemplatesPage;
