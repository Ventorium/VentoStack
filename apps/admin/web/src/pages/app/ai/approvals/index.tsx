import { client } from '@/api';
import type { ApprovalRequestItem } from '@/api/types';
import { fmtDate } from '@/utils/fmtDate';
import {
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useState } from 'react';

const { Text } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待审批', color: 'orange' },
  approved: { label: '已通过', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' },
  expired: { label: '已过期', color: 'default' },
};

const AIApprovalsPage = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApprovalRequestItem[]>([]);
  const [rejecting, setRejecting] = useState<ApprovalRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { error, data: list } = (await client.get('/api/ai/approvals')) as {
        error?: unknown;
        data?: ApprovalRequestItem[];
      };
      if (!error) setData(list ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleApprove = (record: ApprovalRequestItem) => {
    Modal.confirm({
      title: '确认通过审批',
      content: `允许执行工具「${record.toolName}」？`,
      okText: '通过',
      cancelText: '取消',
      onOk: async () => {
        const { error } = await client.post('/api/ai/approvals/:id/approve', {
          params: { id: record.id },
          body: {},
        });
        if (!error) {
          message.success('已通过');
          refresh();
        } else {
          message.error('操作失败');
        }
      },
    });
  };

  const handleReject = async () => {
    if (!rejecting) return;
    setRejectLoading(true);
    try {
      const { error } = await client.post('/api/ai/approvals/:id/reject', {
        params: { id: rejecting.id },
        body: { reason: rejectReason || undefined },
      });
      if (!error) {
        message.success('已拒绝');
        setRejecting(null);
        setRejectReason('');
        refresh();
      }
    } finally {
      setRejectLoading(false);
    }
  };

  const columns: ColumnsType<ApprovalRequestItem> = [
    {
      title: '工具名称',
      dataIndex: 'toolName',
      key: 'toolName',
      width: 160,
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '调用参数',
      dataIndex: 'input',
      key: 'input',
      render: (input: Record<string, unknown>) => (
        <Typography.Text
          code
          ellipsis={{ tooltip: JSON.stringify(input ?? {}, null, 2) }}
          className="max-w-[320px] inline-block align-middle"
        >
          {JSON.stringify(input ?? {})}
        </Typography.Text>
      ),
    },
    { title: '请求者', dataIndex: 'requestedBy', key: 'requestedBy', width: 180, ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const s = statusMap[status] || { label: status, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => fmtDate(date),
    },
    {
      title: '过期时间',
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      width: 180,
      render: (date: string) => <Text type="secondary">{fmtDate(date)}</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, record) =>
        record.status === 'pending' ? (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => handleApprove(record)}
            >
              通过
            </Button>
            <Button
              type="link"
              size="small"
              danger
              icon={<CloseOutlined />}
              onClick={() => {
                setRejectReason('');
                setRejecting(record);
              }}
            >
              拒绝
            </Button>
          </Space>
        ) : (
          <Text type="secondary">已处理</Text>
        ),
    },
  ];

  return (
    <>
      <Card
        title={
          <Space>
            <SafetyCertificateOutlined />
            AI 工具审批中心
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => refresh()}>
            刷新
          </Button>
        }
      >
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="高风险工具调用需要人工审批"
          description="Agent 尝试调用需要审批的工具时，会自动生成审批请求（5 分钟内有效）。通过后用户重试同一操作即可执行；拒绝则工具不会运行。"
        />
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: '暂无待审批请求' }}
        />
      </Card>

      <Modal
        title={`拒绝工具调用：${rejecting?.toolName ?? ''}`}
        open={!!rejecting}
        onOk={handleReject}
        onCancel={() => {
          setRejecting(null);
          setRejectReason('');
        }}
        confirmLoading={rejectLoading}
        okText="拒绝"
        okButtonProps={{ danger: true }}
        cancelText="取消"
      >
        <Input.TextArea
          rows={3}
          placeholder="拒绝原因（可选）"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>
    </>
  );
};

export default AIApprovalsPage;
