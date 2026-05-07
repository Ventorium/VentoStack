import { useState } from 'react'
import { Card, Table, Button, Input, Form, Modal, Space, Tag, Row, Col } from 'antd'
import { msg } from '@/components/GlobalMessage'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { PaginatedData, NoticeItem, CreateNoticeBody, UpdateNoticeBody } from '@/api/types'
import { useTable } from '@/hooks/useTable'
import { cleanParams } from '@/utils/cleanParams'
import { fmtDate } from '@/utils/fmtDate'
import ActionColumn from '@/components/ActionColumn'
import DictSelect from '@/components/DictSelect'

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/notices', { query: cleanParams(params) }) as Promise<{ error?: unknown; data?: PaginatedData<NoticeItem> }>

const NoticePage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange, selectedRowKeys, rowSelection, clearSelection, hasSelected } =
    useTable<NoticeItem>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingNotice, setEditingNotice] = useState<NoticeItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    onSearch(cleanParams(values))
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const openCreate = () => { setEditingNotice(null); form.resetFields(); form.setFieldsValue({ type: 1 }); setModalOpen(true) }
  const openEdit = (r: NoticeItem) => {
    setEditingNotice(r)
    form.setFieldsValue({ title: r.title, content: r.content, type: r.type })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingNotice) {
        const body: UpdateNoticeBody = { title: values.title, content: values.content, type: values.type }
        const { error } = await client.put('/api/system/notices/:id', { params: { id: editingNotice.id }, body })
        if (!error) { msg.success('更新成功'); setModalOpen(false); refresh() }
      } else {
        const body: CreateNoticeBody = { title: values.title, content: values.content, type: values.type }
        const { error } = await client.post('/api/system/notices', { body })
        if (!error) { msg.success('创建成功'); setModalOpen(false); refresh() }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await client.delete('/api/system/notices/:id', { params: { id } })
    if (!error) { msg.success('删除成功'); refresh() }
  }

  const handlePublish = async (id: string) => {
    const { error } = await client.put('/api/system/notices/:id/publish', { params: { id } })
    if (!error) { msg.success('已发布'); refresh() }
  }

  const handleRevoke = async (id: string) => {
    const { error } = await client.put('/api/system/notices/:id/revoke', { params: { id } })
    if (!error) { msg.success('已撤回'); refresh() }
  }

  const typeMap: Record<number, string> = { 1: '通知', 2: '公告' }
  const typeColor: Record<number, string> = { 1: 'blue', 2: 'purple' }
  const statusMap: Record<number, { label: string; color: string }> = {
    0: { label: '草稿', color: 'default' },
    1: { label: '已发布', color: 'green' },
    2: { label: '已撤回', color: 'orange' },
  }

  const columns: ColumnsType<NoticeItem> = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80,
      render: (_: unknown, r: NoticeItem) => <Tag color={typeColor[r.type]}>{typeMap[r.type]}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: NoticeItem) => { const s = statusMap[r.status]; return <Tag color={s?.color}>{s?.label ?? r.status}</Tag> } },
    { title: '发布时间', dataIndex: 'publishAt', key: 'publishAt', width: 180, render: (_: unknown, r: NoticeItem) => fmtDate(r.publishAt) },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: NoticeItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 138, fixed: 'right' as const,
      render: (_: unknown, r: NoticeItem) => {
        const items = [
          { label: '编辑', onClick: () => openEdit(r) },
          ...(r.status === 0 ? [{ label: '发布', onClick: () => handlePublish(r.id) }] : []),
          ...(r.status === 1 ? [{ label: '撤回', onClick: () => handleRevoke(r.id) }] : []),
          ...(r.status === 2 ? [{ label: '重新发布', onClick: () => handlePublish(r.id) }] : []),
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该公告？' },
        ]
        return <ActionColumn items={items} />
      } },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">通知公告</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="title"><Input placeholder="公告标题" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="type">
            <DictSelect typeCode="sys_notice_type" placeholder="类型" allowClear style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="status">
            <DictSelect typeCode="sys_notice_status" placeholder="状态" allowClear style={{ width: 120 }} />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          </Space>
        </Form>
      </Card>
      <Card title={`公告列表（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增公告</Button>}>
        {hasSelected && <div className="mb-2 text-sm text-gray-500">已选 {selectedRowKeys.length} 项 <Button type="link" size="small" onClick={clearSelection}>取消选择</Button></div>}
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small"
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1200 }} rowSelection={rowSelection} />
      </Card>
      <Modal title={editingNotice ? '编辑公告' : '新增公告'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnHidden width={700}>
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}><Input /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="type" label="类型" initialValue={1} rules={[{ required: true }]}>
                <DictSelect typeCode="sys_notice_type" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}><Input.TextArea rows={8} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default NoticePage
