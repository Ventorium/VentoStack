import { useEffect, useState, useCallback } from 'react'
import { Card, Table, Button, Input, Select, Form, Modal, Space, message, Popconfirm } from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { PaginatedData, ConfigItem } from '@/api/types'

const ConfigPage = () => {
  const [loading, setLoading] = useState(false); const [data, setData] = useState<ConfigItem[]>([])
  const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10)
  const [searchForm] = Form.useForm(); const [modalOpen, setModalOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null); const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const fetchData = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true)
    try {
      const values = await searchForm.validateFields().catch(() => ({}))
      const { error, data: result } = await client.get<PaginatedData<ConfigItem>>('/api/system/configs', { query: { page: p, pageSize: ps, ...values } })
      if (!error && result) { setData(result.list); setTotal(result.total); setPage(result.page); setPageSize(result.pageSize) }
    } finally { setLoading(false) }
  }, [page, pageSize, searchForm])

  useEffect(() => { fetchData(1, pageSize) }, [])
  const onSearch = () => fetchData(1, pageSize); const onReset = () => { searchForm.resetFields(); fetchData(1, pageSize) }; const onPageChange = (p: number, ps: number) => fetchData(p, ps)

  const openCreate = () => { setEditingConfig(null); form.resetFields(); form.setFieldsValue({ type: 0 }); setModalOpen(true) }
  const openEdit = (r: ConfigItem) => { setEditingConfig(r); form.setFieldsValue(r); setModalOpen(true) }
  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingConfig) {
        const { error } = await client.put(`/api/system/configs/${editingConfig.key}`, { body: values })
        if (!error) { message.success('更新成功'); setModalOpen(false); fetchData(page, pageSize) }
      } else {
        const { error } = await client.post('/api/system/configs', { body: values })
        if (!error) { message.success('创建成功'); setModalOpen(false); fetchData(page, pageSize) }
      }
    } finally { setModalLoading(false) }
  }
  const handleDelete = async (key: string) => {
    const { error } = await client.delete(`/api/system/configs/${key}`)
    if (!error) { message.success('删除成功'); fetchData(page, pageSize) }
  }

  const typeMap: Record<number, string> = { 0: '字符串', 1: '数字', 2: '布尔', 3: 'JSON' }
  const columns = [
    { title: '参数名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '参数键名', dataIndex: 'key', key: 'key', width: 160 },
    { title: '参数键值', dataIndex: 'value', key: 'value', ellipsis: true, render: (_: unknown, r: ConfigItem) => <span className="font-mono text-sm">{r.value}</span> },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80, render: (_: unknown, r: ConfigItem) => typeMap[r.type] ?? r.type },
    { title: '分组', dataIndex: 'group', key: 'group', width: 100 },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    { title: '操作', key: 'action', width: 160,
      render: (_: unknown, r: ConfigItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该参数？" onConfirm={() => handleDelete(r.key)}><Button type="link" size="small" danger>删除</Button></Popconfirm>
        </Space>
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">系统参数</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name"><Input placeholder="参数名称" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="key"><Input placeholder="参数键名" /></Form.Item>
          <Space><Button type="primary" onClick={onSearch}>搜索</Button><Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button></Space>
        </Form>
      </Card>
      <Card title={`参数列表（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增参数</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }} />
      </Card>
      <Modal title={editingConfig ? '编辑参数' : '新增参数'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnClose>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="参数名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="key" label="参数键名" rules={[{ required: true }]}><Input disabled={!!editingConfig} /></Form.Item>
          <Form.Item name="value" label="参数键值" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="type" label="类型" initialValue={0}>
            <Select><Select.Option value={0}>字符串</Select.Option><Select.Option value={1}>数字</Select.Option><Select.Option value={2}>布尔</Select.Option><Select.Option value={3}>JSON</Select.Option></Select>
          </Form.Item>
          <Form.Item name="group" label="分组"><Input placeholder="system" /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ConfigPage
