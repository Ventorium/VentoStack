import { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Button, Input, Select, Form, Modal, Space, Tag, message, Popconfirm,
} from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { noticeApi } from '@/api/system'
import type { NoticeItem, CreateNoticeBody, UpdateNoticeBody } from '@/api/types'

const NoticePage = () => {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<NoticeItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchForm] = Form.useForm()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingNotice, setEditingNotice] = useState<NoticeItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const fetchData = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true)
    try {
      const values = await searchForm.validateFields().catch(() => ({}))
      const { error, data: result } = await noticeApi.list({ page: p, pageSize: ps, ...values })
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
        const { error } = await noticeApi.update(editingNotice.id, body)
        if (!error) { message.success('更新成功'); setModalOpen(false); fetchData(page, pageSize) }
      } else {
        const body: CreateNoticeBody = { title: values.title, content: values.content, type: values.type }
        const { error } = await noticeApi.create(body)
        if (!error) { message.success('创建成功'); setModalOpen(false); fetchData(page, pageSize) }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await noticeApi.delete(id)
    if (!error) { message.success('删除成功'); fetchData(page, pageSize) }
  }

  const handlePublish = async (id: string) => {
    const { error } = await noticeApi.publish(id)
    if (!error) { message.success('已发布'); fetchData(page, pageSize) }
  }

  const handleRevoke = async (id: string) => {
    const { error } = await noticeApi.revoke(id)
    if (!error) { message.success('已撤回'); fetchData(page, pageSize) }
  }

  const typeMap: Record<number, string> = { 1: '通知', 2: '公告' }
  const typeColor: Record<number, string> = { 1: 'blue', 2: 'purple' }

  const statusMap: Record<number, { label: string; color: string }> = {
    0: { label: '草稿', color: 'default' },
    1: { label: '已发布', color: 'green' },
    2: { label: '已撤回', color: 'orange' },
  }

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 80,
      render: (_: unknown, r: NoticeItem) => (
        <Tag color={typeColor[r.type]}>{typeMap[r.type]}</Tag>
      ),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: NoticeItem) => {
        const s = statusMap[r.status]
        return <Tag color={s?.color}>{s?.label ?? r.status}</Tag>
      },
    },
    { title: '发布时间', dataIndex: 'publishAt', key: 'publishAt', width: 180 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    {
      title: '操作', key: 'action', width: 300,
      render: (_: unknown, r: NoticeItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          {r.status === 0 && (
            <Button type="link" size="small" onClick={() => handlePublish(r.id)}>发布</Button>
          )}
          {r.status === 1 && (
            <Button type="link" size="small" onClick={() => handleRevoke(r.id)}>撤回</Button>
          )}
          <Popconfirm title="确定删除该公告？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">通知公告</h3>

      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="title">
            <Input placeholder="公告标题" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="type">
            <Select placeholder="类型" allowClear style={{ width: 120 }}>
              <Select.Option value={1}>通知</Select.Option>
              <Select.Option value={2}>公告</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态" allowClear style={{ width: 120 }}>
              <Select.Option value={0}>草稿</Select.Option>
              <Select.Option value={1}>已发布</Select.Option>
              <Select.Option value={2}>已撤回</Select.Option>
            </Select>
          </Form.Item>
          <Space>
            <Button type="primary" onClick={onSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button>
          </Space>
        </Form>
      </Card>

      <Card
        title={`公告列表（${total}）`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增公告</Button>}
      >
        <Table
          rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={editingNotice ? '编辑公告' : '新增公告'}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnClose
        width={700}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="类型" initialValue={1} rules={[{ required: true }]}>
            <Select>
              <Select.Option value={1}>通知</Select.Option>
              <Select.Option value={2}>公告</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default NoticePage
