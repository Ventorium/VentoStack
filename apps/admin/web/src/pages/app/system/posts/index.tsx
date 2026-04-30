import { useState } from 'react'
import { Card, Table, Button, Input, Form, Modal, Space, Tag, message, Popconfirm } from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { PaginatedData, PostItem } from '@/api/types'
import { useTable } from '@/hooks/useTable'

const fetcher = (params: Record<string, unknown>) =>
  client.get<PaginatedData<PostItem>>('/api/system/posts', { query: params })

const PostPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<PostItem>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<PostItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const handleSearch = async () => {
    const values = await searchForm.validateFields().catch(() => ({}))
    onSearch(values)
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const openCreate = () => { setEditingPost(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (r: PostItem) => { setEditingPost(r); form.setFieldsValue({ name: r.name, code: r.code, sort: r.sort, remark: r.remark, status: r.status }); setModalOpen(true) }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingPost) {
        const { error } = await client.put(`/api/system/posts/${editingPost.id}`, { body: values })
        if (!error) { message.success('更新成功'); setModalOpen(false); refresh() }
      } else {
        const { error } = await client.post('/api/system/posts', { body: values })
        if (!error) { message.success('创建成功'); setModalOpen(false); refresh() }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await client.delete(`/api/system/posts/${id}`)
    if (!error) { message.success('删除成功'); refresh() }
  }

  const columns = [
    { title: '岗位名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '岗位标识', dataIndex: 'code', key: 'code', width: 160 },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (_: unknown, r: PostItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    { title: '操作', key: 'action', width: 160,
      render: (_: unknown, r: PostItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该岗位？" onConfirm={() => handleDelete(r.id)}><Button type="link" size="small" danger>删除</Button></Popconfirm>
        </Space>
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">岗位管理</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name"><Input placeholder="岗位名称" prefix={<SearchOutlined />} /></Form.Item>
          <Space><Button type="primary" onClick={handleSearch}>搜索</Button><Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button></Space>
        </Form>
      </Card>
      <Card title={`岗位列表（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增岗位</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }} />
      </Card>
      <Modal title={editingPost ? '编辑岗位' : '新增岗位'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnClose>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="岗位名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="code" label="岗位标识" rules={[{ required: true }]}><Input disabled={!!editingPost} /></Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}><Input type="number" /></Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}><Input placeholder="1=正常 0=禁用" /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PostPage
