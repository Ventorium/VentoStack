import { useState } from 'react'
import { Card, Table, Button, Input, Select, Form, Modal, Space, Tag, Row, Col } from 'antd'
import { msg } from '@/components/GlobalMessage'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import { client } from '@/api'
import type { ScheduleJob } from '@/api/types'
import { useTable } from '@/hooks/useTable'
import { cleanParams } from '@/utils/cleanParams'
import { fmtDate } from '@/utils/fmtDate'
import ActionColumn from '@/components/ActionColumn'

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/scheduler/jobs', { query: cleanParams(params) })

const SchedulerPage = () => {
  const navigate = useNavigate()
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } = useTable<ScheduleJob>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<ScheduleJob | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    onSearch(cleanParams(values))
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const openCreate = () => { setEditingJob(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (r: ScheduleJob) => { setEditingJob(r); form.setFieldsValue({ name: r.name, cron: r.cron, handlerId: r.handlerId, params: r.params, description: r.description }); setModalOpen(true) }
  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingJob) {
        const { error } = await client.put('/api/system/scheduler/jobs/:id', { params: { id: editingJob.id }, body: values })
        if (!error) {
          msg.success('更新成功')
          setModalOpen(false)
          refresh()
        }
      } else {
        const { error } = await client.post('/api/system/scheduler/jobs', { body: values })
        if (!error) {
          msg.success('创建成功')
          setModalOpen(false)
          refresh()
        }
      }
    } finally { setModalLoading(false) }
  }
  const handleDelete = async (id: string) => {
    const { error } = await client.delete('/api/system/scheduler/jobs/:id', { params: { id } })
    if (!error) {
      msg.success('删除成功')
      refresh()
    }
  }
  const handleToggle = async (id: string) => {
    const { error } = await client.put('/api/system/scheduler/jobs/:id/toggle', { params: { id } })
    if (!error) {
      msg.success('状态切换成功')
      refresh()
    }
  }
  const handleExecute = async (id: string) => {
    const { error } = await client.post('/api/system/scheduler/jobs/:id/execute', { params: { id } })
    if (!error) {
      msg.success('执行成功')
      refresh()
    }
  }
  const viewLogs = (id: string) => { navigate(`/app/system/scheduler/logs?jobId=${id}`) }

  const columns: ColumnsType<ScheduleJob> = [
    { title: '任务名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: 'Cron表达式', dataIndex: 'cron', key: 'cron', width: 140, render: (v: string) => <span className="font-mono text-sm">{v}</span> },
    { title: '处理器ID', dataIndex: 'handlerId', key: 'handlerId', width: 180 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: string) => v === 'RUNNING' ? <Tag color="green">运行中</Tag> : <Tag color="orange">已暂停</Tag> },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: ScheduleJob) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 200, fixed: 'right' as const,
      render: (_: unknown, r: ScheduleJob) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEdit(r) },
          { label: r.status === 'RUNNING' ? '暂停' : '启动', onClick: () => handleToggle(r.id) },
          { label: '立即执行', onClick: () => handleExecute(r.id), confirm: '确定立即执行该任务？' },
          { label: '查看日志', onClick: () => viewLogs(r.id) },
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该任务？' },
        ]} maxInline={3} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">定时任务</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name"><Input placeholder="任务名称" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="status" initialValue={undefined}>
            <Select placeholder="状态" style={{ width: 120 }} allowClear>
              <Select.Option value="RUNNING">运行中</Select.Option>
              <Select.Option value="PAUSED">已暂停</Select.Option>
            </Select>
          </Form.Item>
          <Space><Button type="primary" onClick={handleSearch}>搜索</Button><Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button></Space>
        </Form>
      </Card>
      <Card title={`任务列表（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增任务</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small"
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1200 }} />
      </Card>
      <Modal title={editingJob ? '编辑任务' : '新增任务'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnClose width={640}>
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="任务名称" rules={[{ required: true }]}><Input placeholder="请输入任务名称" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="handlerId" label="处理器ID" rules={[{ required: true }]}><Input placeholder="请输入处理器ID" /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="cron" label="Cron表达式" rules={[{ required: true }]}><Input placeholder="0 0 2 * * ?" /></Form.Item>
          <Form.Item name="params" label="参数"><Input.TextArea rows={3} placeholder="JSON格式的任务参数" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={3} placeholder="请输入任务描述" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default SchedulerPage
