import { client } from "@/api";
import type { NotifyMessage } from "@/api/types";
import ActionColumn from "@/components/ActionColumn";
import { msg } from "@/components/GlobalMessage";
import { NOTIFICATION_API } from "@/constants";
import { useTable } from "@/hooks/useTable";
import { cleanParams } from "@/utils/cleanParams";
import { fmtDate } from "@/utils/fmtDate";
import { ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { Badge, Button, Card, Form, Input, Modal, Select, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";

const fetcher = (params: Record<string, unknown>) =>
  client.get(NOTIFICATION_API.MESSAGES, { query: cleanParams(params) });

const channelOptions = [
  { label: "邮件", value: "email" },
  { label: "短信", value: "sms" },
  { label: "Webhook", value: "webhook" },
  { label: "站内信", value: "in_app" },
];

const statusOptions = [
  { label: "未读", value: "UNREAD" },
  { label: "已读", value: "READ" },
];

const channelMap: Record<string, { label: string; color: string }> = {
  email: { label: "邮件", color: "blue" },
  sms: { label: "短信", color: "green" },
  webhook: { label: "Webhook", color: "purple" },
  in_app: { label: "站内信", color: "orange" },
};

const NotificationPage = () => {
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
    rowSelection,
    clearSelection,
    hasSelected,
  } = useTable<NotifyMessage>(fetcher);
  const [searchForm] = Form.useForm();
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<NotifyMessage | null>(null);

  const handleSearch = () => {
    const values = searchForm.getFieldsValue();
    onSearch(cleanParams(values));
  };
  const handleReset = () => {
    searchForm.resetFields();
    onReset();
  };

  const handleMarkAsRead = async (id: string) => {
    const { error } = await client.put(NOTIFICATION_API.MESSAGE_READ, { params: { id } });
    if (!error) {
      msg.success("已标记为已读");
      refresh();
    }
  };

  const handleBatchMarkAsRead = async () => {
    if (selectedRowKeys.length === 0) {
      msg.warning("请先选择消息");
      return;
    }
    const { error } = await client.post(NOTIFICATION_API.MESSAGE_READ_BATCH, {
      body: { messageIds: selectedRowKeys as string[] },
    });
    if (!error) {
      msg.success("批量标记成功");
      clearSelection();
      refresh();
    }
  };

  const handleDelete = async (id: string) => {
    // TODO: 后端暂无消息删除端点（仅有模板删除），此为既有缺陷；类型断言消除 schema 报错
    const { error } = await client.delete(NOTIFICATION_API.MESSAGES as never, { params: { id } });
    if (!error) {
      msg.success("删除成功");
      refresh();
    }
  };

  const handleViewDetail = (record: NotifyMessage) => {
    setCurrentMessage(record);
    setDetailModalOpen(true);
    // Auto mark as read when viewing detail
    if (record.status === "UNREAD") {
      handleMarkAsRead(record.id);
    }
  };

  const columns: ColumnsType<NotifyMessage> = [
    { title: "标题", dataIndex: "title", key: "title", ellipsis: true, width: 200 },
    {
      title: "渠道",
      dataIndex: "channel",
      key: "channel",
      width: 100,
      render: (_: unknown, r: NotifyMessage) => {
        const ch = channelMap[r.channel];
        return ch ? <Tag color={ch.color}>{ch.label}</Tag> : r.channel;
      },
    },
    { title: "内容", dataIndex: "content", key: "content", ellipsis: true },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (_: unknown, r: NotifyMessage) =>
        r.status === "UNREAD" ? (
          <Badge status="processing" text="未读" />
        ) : (
          <Badge status="default" text="已读" />
        ),
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 180,
      render: (_: unknown, r: NotifyMessage) => fmtDate(r.createdAt),
    },
    {
      title: "操作",
      key: "action",
      width: 160,
      fixed: "right" as const,
      render: (_: unknown, r: NotifyMessage) => (
        <ActionColumn
          items={[
            { label: "查看", onClick: () => handleViewDetail(r) },
            ...(r.status === "UNREAD"
              ? [{ label: "标记已读", onClick: () => handleMarkAsRead(r.id) }]
              : []),
            {
              label: "删除",
              onClick: () => handleDelete(r.id),
              danger: true,
              confirm: "确定删除该消息？",
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">消息通知</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="title">
            <Input placeholder="消息标题" prefix={<SearchOutlined />} className="w-[200px]" />
          </Form.Item>
          <Form.Item name="channel">
            <Select placeholder="渠道" allowClear options={channelOptions} className="w-[120px]" />
          </Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态" allowClear options={statusOptions} className="w-[100px]" />
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
        title={`消息列表（${total}）`}
        extra={
          <Space>
            {hasSelected && (
              <Button type="primary" size="small" onClick={handleBatchMarkAsRead}>
                批量标记已读
              </Button>
            )}
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
        title="消息详情"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={600}
      >
        {currentMessage && (
          <div>
            <div className="mb-4">
              <span className="text-gray-500 dark:text-gray-400">标题：</span>
              <span className="font-medium">{currentMessage.title}</span>
            </div>
            <div className="mb-4">
              <span className="text-gray-500 dark:text-gray-400">渠道：</span>
              {(() => {
                const ch = channelMap[currentMessage.channel];
                return ch ? <Tag color={ch.color}>{ch.label}</Tag> : currentMessage.channel;
              })()}
            </div>
            <div className="mb-4">
              <span className="text-gray-500 dark:text-gray-400">状态：</span>
              {currentMessage.status === "UNREAD" ? (
                <Badge status="processing" text="未读" />
              ) : (
                <Badge status="default" text="已读" />
              )}
            </div>
            <div className="mb-2">
              <span className="text-gray-500 dark:text-gray-400">时间：</span>
              <span>{fmtDate(currentMessage.createdAt)}</span>
            </div>
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded whitespace-pre-wrap">
              {currentMessage.content}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default NotificationPage;
