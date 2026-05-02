import { useState } from 'react'
import { Card, Table, Button, Input, InputNumber, Select, Form, Modal, Space, Tag, message, Row, Col } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { client } from '@/api'
import type { PaginatedData, PostItem } from '@/api/types'
import { useTable } from '@/hooks/useTable'
import ActionColumn from '@/components/ActionColumn'

const cleanParams = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/posts', { query: cleanParams(params) }) as Promise<{ error?: unknown; data?: PaginatedData<PostItem> }>

const fmtDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'

const PostPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<PostItem>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<PostItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    onSearch(cleanParams(values))
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const openCreate = () => { setEditingPost(null); form.resetFields(); form.setFieldsValue({ sort: 0, status: 1 }); setModalOpen(true) }
  const openEdit = (r: PostItem) => { setEditingPost(r); form.setFieldsValue({ name: r.name, code: r.code, sort: r.sort, remark: r.remark, status: r.status }); setModalOpen(true) }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingPost) {
        await client.put(`/api/system/posts/${editingPost.id}` as '/api/system/posts/:id', { body: values })
        message.success('更新成功'); setModalOpen(false); refresh()
      } else {
        await client.post('/api/system/posts', { body: values })
        message.success('创建成功'); setModalOpen(false); refresh()
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    await client.delete(`/api/system/posts/${id}` as '/api/system/posts/:id')
    message.success('删除成功'); refresh()
  }

  const columns: ColumnsType<PostItem> = [
    { title: '岗位名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '岗位标识', dataIndex: 'code', key: 'code', width: 160 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (_: unknown, r: PostItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: PostItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 130, fixed: 'right' as const,
      render: (_: unknown, r: PostItem) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEdit(r) },
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该岗位？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">岗位管理</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name"><Input placeholder="岗位名称" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态" allowClear style={{ width: 100 }}>
              <Select.Option value={1}>正常</Select.Option>
              <Select.Option value={0}>禁用</Select.Option>
            </Select>
          </Form.Item>
          <Space><Button type="primary" onClick={handleSearch}>搜索</Button><Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button></Space>
        </Form>
      </Card>
      <Card title={`岗位列表（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增岗位</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 900 }} />
      </Card>
      <Modal title={editingPost ? '编辑岗位' : '新增岗位'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnHidden width={640}>
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="岗位名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="code" label="岗位标识" rules={[{ required: true }]}><Input disabled={!!editingPost} /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <Select><Select.Option value={1}>正常</Select.Option><Select.Option value={0}>禁用</Select.Option></Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sort" label="排序" initialValue={0}><InputNumber className="w-full" /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PostPage
