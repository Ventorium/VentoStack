import { useState } from 'react'
import { Card, Table, Button, Input, Select, Form, Modal, Space, message, Row, Col } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { client } from '@/api'
import type { PaginatedData, ConfigItem } from '@/api/types'
import { useTable } from '@/hooks/useTable'
import ActionColumn from '@/components/ActionColumn'

const cleanParams = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/configs', { query: cleanParams(params) }) as Promise<{ error?: unknown; data?: PaginatedData<ConfigItem> }>

const fmtDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'

const ConfigPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<ConfigItem>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    onSearch(cleanParams(values))
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const openCreate = () => { setEditingConfig(null); form.resetFields(); form.setFieldsValue({ type: 0 }); setModalOpen(true) }
  const openEdit = (r: ConfigItem) => { setEditingConfig(r); form.setFieldsValue({ name: r.name, key: r.key, value: r.value, type: r.type, group: r.group, remark: r.remark }); setModalOpen(true) }
  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingConfig) {
        await client.put(`/api/system/configs/${editingConfig.key}` as '/api/system/configs/:id', { body: values })
        message.success('更新成功'); setModalOpen(false); refresh()
      } else {
        await client.post('/api/system/configs', { body: values })
        message.success('创建成功'); setModalOpen(false); refresh()
      }
    } finally { setModalLoading(false) }
  }
  const handleDelete = async (key: string) => {
    await client.delete(`/api/system/configs/${key}` as '/api/system/configs/:id')
    message.success('删除成功'); refresh()
  }

  const typeMap: Record<number, string> = { 0: '字符串', 1: '数字', 2: '布尔', 3: 'JSON' }
  const columns: ColumnsType<ConfigItem> = [
    { title: '参数名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '参数键名', dataIndex: 'key', key: 'key', width: 160 },
    { title: '参数键值', dataIndex: 'value', key: 'value', ellipsis: true, render: (_: unknown, r: ConfigItem) => <span className="font-mono text-sm">{r.value}</span> },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80, render: (_: unknown, r: ConfigItem) => typeMap[r.type] ?? r.type },
    { title: '分组', dataIndex: 'group', key: 'group', width: 100 },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: ConfigItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 130, fixed: 'right' as const,
      render: (_: unknown, r: ConfigItem) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEdit(r) },
          { label: '删除', onClick: () => handleDelete(r.key), danger: true, confirm: '确定删除该参数？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">系统参数</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name"><Input placeholder="参数名称" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="key"><Input placeholder="参数键名" /></Form.Item>
          <Space><Button type="primary" onClick={handleSearch}>搜索</Button><Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button></Space>
        </Form>
      </Card>
      <Card title={`参数列表（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增参数</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1000 }} />
      </Card>
      <Modal title={editingConfig ? '编辑参数' : '新增参数'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnHidden width={640}>
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="参数名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="key" label="参数键名" rules={[{ required: true }]}><Input disabled={!!editingConfig} /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="value" label="参数键值" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="类型" initialValue={0}>
                <Select><Select.Option value={0}>字符串</Select.Option><Select.Option value={1}>数字</Select.Option><Select.Option value={2}>布尔</Select.Option><Select.Option value={3}>JSON</Select.Option></Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="group" label="分组"><Input placeholder="system" /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ConfigPage
