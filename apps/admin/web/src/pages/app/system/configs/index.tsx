import { client } from "@/api";
import type { ConfigItem, PaginatedData } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import DictSelect from "@/components/DictSelect";
import { msg } from "@/components/GlobalMessage";
import { useTable } from "@/hooks/useTable";
import { cleanParams } from "@/utils/cleanParams";
import { fmtDate } from "@/utils/fmtDate";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, Modal, Row, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";

const fetcher = (params: Record<string, unknown>) =>
  client.get("/api/system/configs", { query: cleanParams(params) }) as Promise<{
    error?: unknown;
    data?: PaginatedData<ConfigItem>;
  }>;

const ConfigPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<ConfigItem>(fetcher);
  const [searchForm] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null);
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
    setEditingConfig(null);
    form.resetFields();
    form.setFieldsValue({ type: 0 });
    setModalOpen(true);
  };
  const openEdit = (r: ConfigItem) => {
    setEditingConfig(r);
    form.setFieldsValue({
      name: r.name,
      key: r.key,
      value: r.value,
      type: r.type,
      group: r.group,
      remark: r.remark,
    });
    setModalOpen(true);
  };
  const handleOk = async () => {
    const values = await form.validateFields();
    setModalLoading(true);
    try {
      if (editingConfig) {
        const { error } = await client.put("/api/system/configs/:id", {
          params: { id: editingConfig.id },
          body: {
            name: values.name,
            value: values.value,
            type: values.type,
            remark: values.remark,
          },
        });
        if (!error) {
          msg.success("更新成功");
          setModalOpen(false);
          refresh();
        }
      } else {
        const { error } = await client.post("/api/system/configs", { body: values });
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
    const { error } = await client.delete("/api/system/configs/:id", { params: { id } });
    if (!error) {
      msg.success("删除成功");
      refresh();
    }
  };

  const typeMap: Record<number, string> = { 0: "字符串", 1: "数字", 2: "布尔", 3: "JSON" };

/** 受保护的系统参数 key — 不允许删除 */
const PROTECTED_KEYS = new Set([
  "sys_dept_enabled",
  "sys_user_init_password",
  "sys_password_min_length",
  "sys_password_complexity",
  "sys_password_expire_days",
  "sys_login_max_attempts",
  "sys_login_lock_minutes",
  "sys_site_name",
  "sys_mfa_enabled",
  "sys_mfa_force",
  "sys_passkey_enabled",
]);
  const columns: ColumnsType<ConfigItem> = [
    { title: "参数名称", dataIndex: "name", key: "name", width: 160 },
    { title: "参数键名", dataIndex: "key", key: "key", width: 160 },
    {
      title: "参数键值",
      dataIndex: "value",
      key: "value",
      ellipsis: true,
      render: (_: unknown, r: ConfigItem) => <span className="font-mono text-sm">{r.value}</span>,
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 80,
      render: (_: unknown, r: ConfigItem) => typeMap[r.type] ?? r.type,
    },
    { title: "分组", dataIndex: "group", key: "group", width: 100 },
    { title: "备注", dataIndex: "remark", key: "remark", ellipsis: true },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (_: unknown, r: ConfigItem) => fmtDate(r.createdAt),
    },
    {
      title: "操作",
      key: "action",
      width: 130,
      fixed: "right" as const,
      render: (_: unknown, r: ConfigItem) => (
        <ActionColumn
          items={[
            { label: "编辑", onClick: () => openEdit(r) },
            ...(PROTECTED_KEYS.has(r.key)
              ? []
              : [
                  {
                    label: "删除",
                    onClick: () => handleDelete(r.id),
                    danger: true as const,
                    confirm: "确定删除该参数？",
                  },
                ]),
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">系统参数</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name">
            <Input placeholder="参数名称" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="key">
            <Input placeholder="参数键名" />
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
        title={`参数列表（${total}）`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增参数
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
          scroll={{ x: 1000 }}
        />
      </Card>
      <Modal
        title={editingConfig ? "编辑参数" : "新增参数"}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnHidden
        width={640}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="参数名称" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="key" label="参数键名" rules={[{ required: true }]}>
                <Input disabled={!!editingConfig} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="value" label="参数键值" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="类型" initialValue={0}>
                <DictSelect typeCode="sys_config_type" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="group" label="分组">
                <Input placeholder="system" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ConfigPage;
