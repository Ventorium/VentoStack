import { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Button, Input, Form, Modal, Space, Tag, message, Popconfirm,
} from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { postApi } from '@/api/system'
import type { PostItem, CreatePostBody, UpdatePostBody } from '@/api/types'

const PostPage = () => {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PostItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchForm] = Form.useForm()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<PostItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const fetchData = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true)
    try {
      const values = await searchForm.validateFields().catch(() => ({}))
      const { error, data: result } = await postApi.list({ page: p, pageSize: ps, ...values })
      if (!error && result) {
        setData(result.list); setTotal(result.total)
        setPage(result.page); setPageSize(result.pageSize)
      }
    } finally { setLoading(false) }
  }, [page, pageSize, searchForm])

  useEffect(() => { fetchData(1, pageSize) }, [])

  const onSearch = () => fetchData(1, pageSize)
  const onReset = () => { searchForm.resetFields(); fetchData(1, pageSize) }
  const onPageChange = (p: number, ps: number) => fetchData(p, ps)

  const openCreate = () => { setEditingPost(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (r: PostItem) => {
    setEditingPost(r)
    form.setFieldsValue({ name: r.name, code: r.code, sort: r.sort, remark: r.remark, status: r.status })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingPost) {
        const body: UpdatePostBody = { name: values.name, sort: values.sort, remark: values.remark, status: values.status }
        const { error } = await postApi.update(editingPost.id, body)
        if (!error) { message.success('更新成功'); setModalOpen(false); fetchData(page, pageSize) }
      } else {
        const body: CreatePostBody = { name: values.name, code: values.code, sort: values.sort, remark: values.remark }
        const { error } = await postApi.create(body)
        if (!error) { message.success('创建成功'); setModalOpen(false); fetchData(page, pageSize) }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await postApi.delete(id)
    if (!error) { message.success('删除成功'); fetchData(page, pageSize) }
  }

  const columns = [
    { title: '岗位名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '岗位标识', dataIndex: 'code', key: 'code', width: 160 },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: PostItem) => (
        <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag>
      ),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    {
      title: '操作', key: 'action', width: 160,
      render: (_: unknown, r: PostItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该岗位？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">岗位管理</h3>

      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name">
            <Input placeholder="岗位名称" prefix={<SearchOutlined />} />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={onSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button>
          </Space>
        </Form>
      </Card>

      <Card
        title={`岗位列表（${total}）`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增岗位</Button>}
      >
        <Table
          rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 800 }}
        />
      </Card>

      <Modal
        title={editingPost ? '编辑岗位' : '新增岗位'}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="岗位名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="岗位标识" rules={[{ required: true, message: '请输入标识' }]}>
            <Input disabled={!!editingPost} />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}>
            <Input placeholder="1=正常 0=禁用" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PostPage
