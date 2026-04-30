import { Card, Table, Input, Select, Form, Button, Tag, Space } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { PaginatedData, LoginLogItem } from '@/api/types'
import { useTable } from '@/hooks/useTable'

const fetcher = (params: Record<string, unknown>) =>
  client.get<PaginatedData<LoginLogItem>>('/api/system/login-logs', { query: params })

const LoginLogPage = () => {
  const { loading, data, total, page, pageSize, onSearch, onReset, onPageChange } =
    useTable<LoginLogItem>(fetcher)
  const [searchForm] = Form.useForm()

  const handleSearch = async () => {
    const values = await searchForm.validateFields().catch(() => ({}))
    onSearch(values)
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const columns = [
    { title: '用户', dataIndex: 'username', key: 'username', width: 120 },
    { title: 'IP', dataIndex: 'ip', key: 'ip', width: 140 },
    { title: '位置', dataIndex: 'location', key: 'location', width: 160, ellipsis: true },
    { title: '浏览器', dataIndex: 'browser', key: 'browser', width: 160, ellipsis: true },
    { title: '操作系统', dataIndex: 'os', key: 'os', width: 120, ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: LoginLogItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '成功' : '失败'}</Tag> },
    { title: '信息', dataIndex: 'message', key: 'message', ellipsis: true },
    { title: '登录时间', dataIndex: 'loginAt', key: 'loginAt', width: 180 },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">登录日志</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="username"><Input placeholder="用户名" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态" allowClear style={{ width: 120 }}>
              <Select.Option value={1}>成功</Select.Option>
              <Select.Option value={0}>失败</Select.Option>
            </Select>
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          </Space>
        </Form>
      </Card>
      <Card title={`登录日志（${total}）`}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1100 }} size="small" />
      </Card>
    </div>
  )
}

export default LoginLogPage
