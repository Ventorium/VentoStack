import { useState, useCallback } from 'react'
import { Card, Table, Button, Input, Select, Form, Modal, Space, Tag, message, Popconfirm } from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { PaginatedData, UserItem } from '@/api/types'
import { useTable } from '@/hooks/useTable'

const fetcher = (params: Record<string, unknown>) =>
  client.get<PaginatedData<UserItem>>('/api/system/users', { query: params })

const UserPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<UserItem>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const handleSearch = async () => {
    const values = await searchForm.validateFields().catch(() => ({}))
    onSearch(values)
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const openCreate = () => { setEditingUser(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (r: UserItem) => {
    setEditingUser(r)
    form.setFieldsValue({ username: r.username, nickname: r.nickname, email: r.email, phone: r.phone, status: r.status, deptId: r.deptId, remark: '' })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingUser) {
        const { error } = await client.put(`/api/system/users/${editingUser.id}`, { body: { nickname: values.nickname, email: values.email, phone: values.phone, status: values.status, deptId: values.deptId } })
        if (!error) { message.success('更新成功'); setModalOpen(false); refresh() }
      } else {
        const { error } = await client.post('/api/system/users', { body: { username: values.username, password: values.password, nickname: values.nickname, email: values.email, phone: values.phone, status: values.status } })
        if (!error) { message.success('创建成功'); setModalOpen(false); refresh() }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await client.delete(`/api/system/users/${id}`)
    if (!error) { message.success('删除成功'); refresh() }
  }

  const handleStatus = async (id: string, status: number) => {
    const newStatus = status === 1 ? 0 : 1
    const { error } = await client.put(`/api/system/users/${id}/status`, { body: { status: newStatus } })
    if (!error) { message.success(newStatus === 1 ? '已启用' : '已禁用'); refresh() }
  }

  const handleResetPwd = async (id: string) => {
    const { error } = await client.put(`/api/system/users/${id}/reset-pwd`, { body: { newPassword: '123456' } })
    if (!error) message.success('密码已重置为 123456')
  }

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 140 },
    { title: '昵称', dataIndex: 'nickname', key: 'nickname', width: 140 },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 200 },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 140 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: UserItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    { title: '操作', key: 'action', width: 280,
      render: (_: unknown, r: UserItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Button type="link" size="small" onClick={() => handleResetPwd(r.id)}>重置密码</Button>
          <Button type="link" size="small" onClick={() => handleStatus(r.id, r.status)}>{r.status === 1 ? '禁用' : '启用'}</Button>
          <Popconfirm title="确定删除该用户？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">用户管理</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="username"><Input placeholder="用户名" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态" allowClear style={{ width: 120 }}>
              <Select.Option value={1}>正常</Select.Option>
              <Select.Option value={0}>禁用</Select.Option>
            </Select>
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          </Space>
        </Form>
      </Card>
      <Card title={`用户列表（${total}）`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1000 }} />
      </Card>
      <Modal title={editingUser ? '编辑用户' : '新增用户'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnClose>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}><Input disabled={!!editingUser} /></Form.Item>
          {!editingUser && <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}><Input.Password /></Form.Item>}
          <Form.Item name="nickname" label="昵称"><Input /></Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}><Input /></Form.Item>
          <Form.Item name="phone" label="手机号"><Input /></Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}>
            <Select><Select.Option value={1}>正常</Select.Option><Select.Option value={0}>禁用</Select.Option></Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default UserPage
