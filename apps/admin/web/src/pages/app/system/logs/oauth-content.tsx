import { oauthApi } from '@/api/oauth';
import type { OAuthAuthLogItem } from '@/api/types';
import { SearchField, SearchToolbar } from '@/components/SearchToolbar';
import { useTable } from '@/hooks/useTable';
import { cleanParams } from '@/utils/cleanParams';
import { fmtDate } from '@/utils/fmtDate';
import { Form, Input, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

const fetcher = (params: Record<string, unknown>) => oauthApi.logs(cleanParams(params));

export default function OAuthLogContent() {
  const table = useTable<OAuthAuthLogItem>(fetcher);
  const [form] = Form.useForm();
  const columns: ColumnsType<OAuthAuthLogItem> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (value: string) => fmtDate(value),
    },
    { title: '事件', dataIndex: 'event_type', width: 180 },
    {
      title: '应用',
      dataIndex: 'application_name_snapshot',
      width: 160,
      render: (value) => value || '-',
    },
    { title: 'Client ID', dataIndex: 'client_id_snapshot', ellipsis: true },
    { title: '用户', dataIndex: 'user_id', width: 180, render: (value) => value || '-' },
    {
      title: '结果',
      dataIndex: 'success',
      width: 80,
      render: (value: boolean) => (
        <Tag color={value ? 'green' : 'red'}>{value ? '成功' : '失败'}</Tag>
      ),
    },
    { title: '原因', dataIndex: 'failure_code', width: 150, render: (value) => value || '-' },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (value) => value || '-' },
  ];
  return (
    <div>
      <SearchToolbar
        form={form}
        onSearch={() => table.onSearch(cleanParams(form.getFieldsValue()))}
        onReset={() => {
          form.resetFields();
          table.onReset();
        }}
      >
        <SearchField name="eventType" width="wide">
          <Input placeholder="事件类型" />
        </SearchField>
        <SearchField name="clientId" width="wide">
          <Input placeholder="Client ID" />
        </SearchField>
        <SearchField name="userId" width="wide">
          <Input placeholder="用户 ID" />
        </SearchField>
        <SearchField name="success">
          <Select
            allowClear
            placeholder="结果"
            options={[
              { label: '成功', value: true },
              { label: '失败', value: false },
            ]}
          />
        </SearchField>
      </SearchToolbar>
      <Table
        className="mt-4"
        rowKey="id"
        columns={columns}
        dataSource={table.data}
        loading={table.loading}
        size="small"
        scroll={{ x: 1200 }}
        pagination={{
          current: table.page,
          pageSize: table.pageSize,
          total: table.total,
          showSizeChanger: true,
          onChange: table.onPageChange,
        }}
      />
    </div>
  );
}
