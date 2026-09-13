import { client } from '@/api';
import type { PaginatedData, WorkflowInstanceItem } from '@/api/types';
import ActionColumn from '@/components/ActionColumn';
import { msg } from '@/components/GlobalMessage';
import { SearchField, SearchToolbar } from '@/components/SearchToolbar';
import { useTable } from '@/hooks/useTable';
import { fmtDate } from '@/utils/fmtDate';
import { Card, Form, Input, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/workflow/instances', { query: params }) as Promise<{
    error?: unknown;
    data?: PaginatedData<WorkflowInstanceItem>;
  }>;

const InstanceStatusMap: Record<number, { label: string; color: string }> = {
  0: { label: '进行中', color: 'processing' },
  1: { label: '已完成', color: 'green' },
  2: { label: '已拒绝', color: 'red' },
  3: { label: '已撤回', color: 'orange' },
  4: { label: '已终止', color: 'default' },
};

const WorkflowInstancesPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<WorkflowInstanceItem>(fetcher);
  const [searchForm] = Form.useForm();

  const handleWithdraw = async (id: string) => {
    const { error } = await client.post('/api/workflow/instances/:id/withdraw', {
      params: { id },
      body: { comment: '发起人撤回' },
    });
    if (!error) {
      msg.success('撤回成功');
      refresh();
    }
  };

  const columns: ColumnsType<WorkflowInstanceItem> = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      render: (v: string | null) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (_: unknown, r: WorkflowInstanceItem) => {
        const s = InstanceStatusMap[r.status] ?? { label: '未知', color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '发起时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (_: unknown, r: WorkflowInstanceItem) => fmtDate(r.createdAt),
    },
    {
      title: '结束时间',
      dataIndex: 'endedAt',
      key: 'endedAt',
      width: 180,
      render: (_: unknown, r: WorkflowInstanceItem) => (r.endedAt ? fmtDate(r.endedAt) : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, r: WorkflowInstanceItem) => (
        <ActionColumn
          items={[
            ...(r.status === 0
              ? [
                  {
                    label: '撤回',
                    onClick: () => handleWithdraw(r.id),
                    danger: true,
                    confirm: '确定撤回？',
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <Card>
      <div className="mb-4">
        <SearchToolbar
          form={searchForm}
          onSearch={() => onSearch({ title: searchForm.getFieldValue('title') })}
          onReset={() => {
            searchForm.resetFields();
            onReset();
          }}
        >
          <SearchField name="title" width="wide">
            <Input placeholder="搜索标题" allowClear />
          </SearchField>
        </SearchToolbar>
      </div>

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
        scroll={{ x: 800 }}
      />
    </Card>
  );
};

export default WorkflowInstancesPage;
