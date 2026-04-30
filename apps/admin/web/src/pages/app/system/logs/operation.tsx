import { Card, Table, Input, Select, Form, Button, Tag, Space } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { PaginatedData, OperationLogItem } from '@/api/types'
import { useTable } from '@/hooks/useTable'

const fetcher = (params: Record<string, unknown>) =>
  client.get<PaginatedData<OperationLogItem>>('/api/system/operation-logs', { query: params })

const OperationLogPage = () => {
  const { loading, data, total, page, pageSize, onSearch, onReset, onPageChange } =
    useTable<OperationLogItem>(fetcher)
  const [searchForm] = Form.useForm()

  const handleSearch = async () => {
    const values = await searchForm.validateFields().catch(() => ({}))
    onSearch(values)
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const resultMap: Record<number, { label: string; color: string }> = {
    0: { label: '失败', color: 'red' },
    1: { label: '成功', color: 'green' },
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 100, ellipsis: true },
    { title: '用户', dataIndex: 'username', key: 'username', width: 100 },
    { title: '模块', dataIndex: 'module', key: 'module', width: 100 },
    { title: '操作', dataIndex: 'action', key: 'action', width: 100 },
    { title: '请求方式', dataIndex: 'method', key: 'method', width: 80 },
    { title: '请求地址', dataIndex: 'url', key: 'url', ellipsis: true,
      render: (_: unknown, r: OperationLogItem) => <span className="font-mono text-sm">{r.method} {r.url}</span> },
    { title: 'IP', dataIndex: 'ip', key: 'ip', width: 120 },
    { title: '结果', dataIndex: 'result', key: 'result', width: 80,
      render: (_: unknown, r: OperationLogItem) => { const s = resultMap[r.result]; return <Tag color={s?.color}>{s?.label ?? r.result}</Tag> } },
    { title: '耗时(ms)', dataIndex: 'duration', key: 'duration', width: 80 },
    { title: '操作时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">操作日志</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="username"><Input placeholder="用户名" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="module"><Input placeholder="模块" /></Form.Item>
          <Form.Item name="result">
            <Select placeholder="结果" allowClear style={{ width: 120 }}>
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
      <Card title={`操作日志（${total}）`}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1200 }} size="small" />
      </Card>
    </div>
  )
}

export default OperationLogPage
