import { useState } from 'react'
import { Card, Table, Button, Input, Form, Modal, Space, Tag, Select, Row, Col, Switch } from 'antd'
import { msg } from '@/components/GlobalMessage'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { NotifyTemplate } from '@/api/types'
import { useTable, cleanParams, fmtDate } from '@ventostack/gui'
import ActionColumn from '@/components/ActionColumn'

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/notification/templates', { query: cleanParams(params) })

const channelOptions = [
  { label: '邮件', value: 'smtp' },
  { label: '短信', value: 'sms' },
  { label: 'Webhook', value: 'webhook' },
]

const channelMap: Record<string, { label: string; color: string }> = {
  smtp: { label: '邮件', color: 'blue' },
  sms: { label: '短信', color: 'green' },
  webhook: { label: 'Webhook', color: 'purple' },
}

const NotifyTemplatesPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } = useTable<NotifyTemplate>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<NotifyTemplate | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    onSearch(cleanParams(values))
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const openCreate = () => { setEditingTemplate(null); form.resetFields(); form.setFieldsValue({ status: 1 }); setModalOpen(true) }
  const openEdit = (r: NotifyTemplate) => {
    setEditingTemplate(r)
    form.setFieldsValue({ type: r.type, channel: r.channel, titleTemplate: r.titleTemplate, contentTemplate: r.contentTemplate, variables: r.variables, status: r.status })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingTemplate) {
        const { error } = await client.put('/api/system/notification/templates/:id', {
          params: { id: editingTemplate.id },
          body: { type: values.type, channel: values.channel, titleTemplate: values.titleTemplate, contentTemplate: values.contentTemplate, variables: values.variables, status: values.status ? 1 : 0 },
        })
        if (!error) {
          msg.success('更新成功')
          setModalOpen(false)
          refresh()
        }
      } else {
        const { error } = await client.post('/api/system/notification/templates', {
          body: { type: values.type, channel: values.channel, titleTemplate: values.titleTemplate, contentTemplate: values.contentTemplate, variables: values.variables, status: values.status ? 1 : 0 },
        })
        if (!error) {
          msg.success('创建成功')
          setModalOpen(false)
          refresh()
        }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await client.delete('/api/system/notification/templates/:id', { params: { id } })
    if (!error) {
      msg.success('删除成功')
      refresh()
    }
  }

  const columns: ColumnsType<NotifyTemplate> = [
    { title: '类型', dataIndex: 'type', key: 'type', width: 150 },
    { title: '渠道', dataIndex: 'channel', key: 'channel', width: 100,
      render: (_: unknown, r: NotifyTemplate) => {
        const ch = channelMap[r.channel]
        return ch ? <Tag color={ch.color}>{ch.label}</Tag> : r.channel
      } },
    { title: '标题模板', dataIndex: 'titleTemplate', key: 'titleTemplate', ellipsis: true },
    { title: '内容模板', dataIndex: 'contentTemplate', key: 'contentTemplate', ellipsis: true },
    { title: '变量', dataIndex: 'variables', key: 'variables', ellipsis: true },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: NotifyTemplate) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '启用' : '禁用'}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: NotifyTemplate) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 136, fixed: 'right' as const,
      render: (_: unknown, r: NotifyTemplate) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEdit(r) },
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该模板？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">通知模板</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="channel">
            <Select placeholder="渠道" allowClear options={channelOptions} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="type"><Input placeholder="类型" prefix={<SearchOutlined />} style={{ width: 200 }} /></Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          </Space>
        </Form>
      </Card>
      <Card title={`模板列表（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增模板</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small"
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1200 }} />
      </Card>
      <Modal title={editingTemplate ? '编辑模板' : '新增模板'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnClose width={700}>
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="类型" rules={[{ required: true, message: '请输入类型' }]}>
                <Input placeholder="如: welcome" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="channel" label="渠道" rules={[{ required: true, message: '请选择渠道' }]}>
                <Select options={channelOptions} placeholder="选择渠道" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="titleTemplate" label="标题模板" rules={[{ required: true, message: '请输入标题模板' }]}>
            <Input placeholder="如: 欢迎 {{username}}" />
          </Form.Item>
          <Form.Item name="contentTemplate" label="内容模板" rules={[{ required: true, message: '请输入内容模板' }]}>
            <Input.TextArea rows={6} placeholder="如: 您好 {{username}}，欢迎加入..." />
          </Form.Item>
          <Form.Item name="variables" label="变量" tooltip="模板中可用的变量，逗号分隔">
            <Input placeholder="如: username, email, code" />
          </Form.Item>
          <Form.Item name="status" label="状态" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default NotifyTemplatesPage
