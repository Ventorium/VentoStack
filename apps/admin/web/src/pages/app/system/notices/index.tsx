import { client } from "@/api";
import type { CreateNoticeBody, NoticeItem, PaginatedData, UpdateNoticeBody } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import DictSelect from "@/components/DictSelect";
import { msg } from "@/components/GlobalMessage";
import { useTable } from "@/hooks/useTable";
import { cleanParams } from "@/utils/cleanParams";
import { fmtDate } from "@/utils/fmtDate";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Card, Col, Form, Input, Modal, Row, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import WorkflowBanner from "@/components/WorkflowStatus";

const fetcher = (params: Record<string, unknown>) =>
  client.get("/api/system/notices", { query: cleanParams(params) }) as Promise<{
    error?: unknown;
    data?: PaginatedData<NoticeItem>;
  }>;

const NoticePage = () => {
  const {
    loading,
    data,
    total,
    page,
    pageSize,
    refresh,
    onSearch,
    onReset,
    onPageChange,
    selectedRowKeys,
    selectedRows,
    rowSelection,
    clearSelection,
    hasSelected,
  } = useTable<NoticeItem>(fetcher);
  const [searchForm] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<NoticeItem | null>(null);
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
    setEditingNotice(null);
    form.resetFields();
    form.setFieldsValue({ type: 1 });
    setModalOpen(true);
  };
  const openEdit = (r: NoticeItem) => {
    setEditingNotice(r);
    form.setFieldsValue({ title: r.title, content: r.content, type: Number(r.type) });
    setModalOpen(true);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    setModalLoading(true);
    try {
      if (editingNotice) {
        const body: UpdateNoticeBody = {
          title: values.title,
          content: values.content,
          type: values.type,
        };
        const { error } = await client.put("/api/system/notices/:id", {
          params: { id: editingNotice.id },
          body,
        });
        if (!error) {
          msg.success("更新成功");
          setModalOpen(false);
          refresh();
        }
      } else {
        const body: CreateNoticeBody = {
          title: values.title,
          content: values.content,
          type: values.type,
        };
        const { error } = await client.post("/api/system/notices", { body });
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

  /** 提交上架审批（所有上架必须走审批流） */
  const handlePublishApproval = async (r: NoticeItem) => {
    const { error: defErr, data: def } = await client.get("/api/workflow/definitions/by-business-type/:type", {
      params: { type: "notice" },
    });
    if (defErr || !def) {
      msg.warning("未配置公告审批流程，请先在审批流程中创建并绑定 notice 业务类型");
      return;
    }
    const defData = def as { id: string };
    const { error } = await client.post("/api/workflow/instances", {
      body: {
        definitionId: defData.id,
        businessType: "notice",
        businessId: r.id,
        title: `公告上架审批: ${r.title}`,
        formData: { noticeId: r.id, title: r.title, content: r.content, type: r.type },
      },
    });
    if (!error) {
      msg.success("已提交上架审批");
      refresh();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await client.delete("/api/system/notices/:id", { params: { id } });
    if (!error) {
      msg.success("删除成功");
      refresh();
    }
  };

  const handlePublish = async (id: string) => {
    const { error } = await client.put("/api/system/notices/:id/publish", { params: { id } });
    if (!error) {
      msg.success("已发布");
      refresh();
    }
  };

  const handleRevoke = async (id: string) => {
    const { error } = await client.put("/api/system/notices/:id/revoke", { params: { id } });
    if (!error) {
      msg.success("已撤回");
      refresh();
    }
  };

  const showBatchResult = (result: { success: number; skipped: number }, action: string) => {
    if (result.skipped > 0) {
      msg.success(`${action}完成：成功 ${result.success} 项，跳过 ${result.skipped} 项`);
    } else {
      msg.success(`${action}成功，共 ${result.success} 项`);
    }
  };

  const handleBatchPublish = () => {
    const names = selectedRows.map((r) => r.title).join("、");
    Modal.confirm({
      title: "批量发布",
      content: `确定要发布以下 ${selectedRowKeys.length} 项通知吗？\n${names}`,
      onOk: async () => {
        const { error, data } = await client.post("/api/system/notices/batch-publish", {
          body: { ids: selectedRowKeys as string[] },
        });
        if (!error) {
          showBatchResult(data as { success: number; skipped: number }, "发布");
          clearSelection();
          refresh();
        }
      },
    });
  };

  const handleBatchRevoke = () => {
    const names = selectedRows.map((r) => r.title).join("、");
    Modal.confirm({
      title: "批量下架",
      content: `确定要下架以下 ${selectedRowKeys.length} 项通知吗？\n${names}`,
      onOk: async () => {
        const { error, data } = await client.post("/api/system/notices/batch-revoke", {
          body: { ids: selectedRowKeys as string[] },
        });
        if (!error) {
          showBatchResult(data as { success: number; skipped: number }, "下架");
          clearSelection();
          refresh();
        }
      },
    });
  };

  const handleBatchDelete = () => {
    const names = selectedRows.map((r) => r.title).join("、");
    Modal.confirm({
      title: "批量删除",
      content: `确定要删除以下 ${selectedRowKeys.length} 项通知吗？此操作不可恢复。\n${names}`,
      okType: "danger",
      okText: "确定删除",
      onOk: async () => {
        const { error, data } = await client.post("/api/system/notices/batch-delete", {
          body: { ids: selectedRowKeys as string[] },
        });
        if (!error) {
          showBatchResult(data as { success: number; skipped: number }, "删除");
          clearSelection();
          refresh();
        }
      },
    });
  };

  const typeMap: Record<string, string> = { "1": "通知", "2": "公告" };
  const typeColor: Record<string, string> = { "1": "blue", "2": "purple" };
  const statusMap: Record<number, { label: string; color: string }> = {
    0: { label: "草稿", color: "default" },
    1: { label: "已发布", color: "green" },
    2: { label: "已撤回", color: "orange" },
  };

  const columns: ColumnsType<NoticeItem> = [
    { title: "标题", dataIndex: "title", key: "title", ellipsis: true },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 80,
      render: (_: unknown, r: NoticeItem) => <Tag color={typeColor[r.type]}>{typeMap[r.type]}</Tag>,
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (_: unknown, r: NoticeItem) => {
        const s = statusMap[r.status];
        return <Tag color={s?.color}>{s?.label ?? r.status}</Tag>;
      },
    },
    {
      title: "发布时间",
      dataIndex: "publishAt",
      key: "publishAt",
      width: 180,
      render: (_: unknown, r: NoticeItem) => fmtDate(r.publishAt),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (_: unknown, r: NoticeItem) => fmtDate(r.createdAt),
    },
    {
      title: "操作",
      key: "action",
      width: 138,
      fixed: "right" as const,
      render: (_: unknown, r: NoticeItem) => {
        const items = [
          ...(r.status !== 1 ? [{ label: "编辑", onClick: () => openEdit(r) }] : []),
          ...(r.status === 0 ? [{ label: "上架审批", onClick: () => handlePublishApproval(r) }] : []),
          ...(r.status === 1 ? [{ label: "下架", onClick: () => handleRevoke(r.id) }] : []),
          ...(r.status === 2 ? [{ label: "重新提交审批", onClick: () => handlePublishApproval(r) }] : []),
          ...(r.status !== 1
            ? [
                {
                  label: "删除",
                  onClick: () => handleDelete(r.id),
                  danger: true,
                  confirm: "确定删除该公告？",
                },
              ]
            : []),
        ];
        return <ActionColumn items={items} />;
      },
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">通知公告</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="title">
            <Input placeholder="公告标题" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="type">
            <DictSelect
              typeCode="sys_notice_type"
              placeholder="类型"
              allowClear
              style={{ width: 120 }}
            />
          </Form.Item>
          <Form.Item name="status">
            <DictSelect
              typeCode="sys_notice_status"
              placeholder="状态"
              allowClear
              style={{ width: 120 }}
            />
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
        title={`公告列表（${total}）`}
        extra={
          <Space>
            {hasSelected && (
              <>
                <Button size="small" onClick={handleBatchPublish}>
                  批量发布
                </Button>
                <Button size="small" onClick={handleBatchRevoke}>
                  批量下架
                </Button>
                <Button size="small" danger onClick={handleBatchDelete}>
                  批量删除
                </Button>
              </>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增公告
            </Button>
          </Space>
        }
      >
        {hasSelected && (
          <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            已选 {selectedRowKeys.length} 项{" "}
            <Button type="link" size="small" onClick={clearSelection}>
              取消选择
            </Button>
          </div>
        )}
        <Table
          rowKey="id"
          columns={columns}
          expandable={{
            expandedRowRender: (r) => <WorkflowBanner businessType="notice" businessId={r.id} />,
            rowExpandable: () => true,
          }}
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
          rowSelection={rowSelection}
        />
      </Card>
      <Modal
        title={editingNotice ? "编辑公告" : "新增公告"}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnHidden
        width={700}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="title"
                label="标题"
                rules={[{ required: true, message: "请输入标题" }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="type" label="类型" initialValue={1} rules={[{ required: true }]}>
                <DictSelect typeCode="sys_notice_type" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="content"
            label="内容"
            rules={[{ required: true, message: "请输入内容" }]}
          >
            <Input.TextArea rows={8} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default NoticePage;
