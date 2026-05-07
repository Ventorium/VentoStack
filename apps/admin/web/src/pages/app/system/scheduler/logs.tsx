import { useState, useEffect } from 'react'
import { Card, Table, Button, Select, Form, Space, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router'
import { client } from '@/api'
import type { ScheduleJobLog } from '@/api/types'
import { cleanParams } from '@/utils/cleanParams'
import { fmtDate } from '@/utils/fmtDate'

const SchedulerLogsPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const jobId = searchParams.get('jobId')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ScheduleJobLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchForm] = Form.useForm()

  const fetchData = async (params: Record<string, unknown>) => {
    setLoading(true)
    try {
      const query = cleanParams({ ...params, jobId })
      const { error, data } = await client.get(jobId ? '/api/system/scheduler/jobs/:id/logs' : '/api/system/scheduler/logs', {
        query,
        ...(jobId ? { params: { id: jobId } } : {})
      })
      if (!error && data) {
        setData(data.list || [])
        setTotal(data.total || 0)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData({ page, pageSize }) }, [jobId])

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setPage(1)
    fetchData({ page: 1, pageSize, ...values })
  }
  const onPageChange = (newPage: number, newPageSize: number) => {
    setPage(newPage)
    setPageSize(newPageSize)
    fetchData({ page: newPage, pageSize: newPageSize, ...searchForm.getFieldsValue() })
  }

  const columns: ColumnsType<ScheduleJobLog> = [
    { title: '任务名称', dataIndex: 'jobName', key: 'jobName', width: 160 },
    { title: '开始时间', dataIndex: 'startAt', key: 'startAt', width: 180, render: (_: unknown, r: ScheduleJobLog) => fmtDate(r.startAt) },
    { title: '结束时间', dataIndex: 'endAt', key: 'endAt', width: 180, render: (_: unknown, r: ScheduleJobLog) => fmtDate(r.endAt) },
    { title: '耗时', dataIndex: 'durationMs', key: 'durationMs', width: 100, render: (v: number) => `${v}ms` },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => v === 'SUCCESS' ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag> },
    { title: '错误信息', dataIndex: 'error', key: 'error', ellipsis: true, render: (v: string) => v || '-' },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">执行日志</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="status" initialValue={undefined}>
            <Select placeholder="状态" style={{ width: 120 }} allowClear>
              <Select.Option value="SUCCESS">成功</Select.Option>
              <Select.Option value="FAILED">失败</Select.Option>
            </Select>
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={() => fetchData({ page, pageSize })}>刷新</Button>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/app/system/scheduler')}>返回</Button>
          </Space>
        </Form>
      </Card>
      <Card title={`日志列表（${total}）`}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small"
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1000 }} />
      </Card>
    </div>
  )
}

export default SchedulerLogsPage
