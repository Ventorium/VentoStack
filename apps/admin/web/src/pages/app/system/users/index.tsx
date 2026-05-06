import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Button, Input, Form, Modal, Space, Tag, Row, Col, Tree, Spin } from 'antd'
import { msg } from '@/components/GlobalMessage'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, ApartmentOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { client } from '@/api'
import type { PaginatedData, UserItem, DeptItem } from '@/api/types'
import { useTable, cleanParams, fmtDate } from '@ventostack/gui'
import ActionColumn from '@/components/ActionColumn'
import DictSelect from '@/components/DictSelect'
import { usePublicConfig } from '@/hooks/usePublicConfig'

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/users', { query: cleanParams(params) }) as Promise<{ error?: unknown; data?: PaginatedData<UserItem> }>

/** Flatten dept tree into antd TreeDataNode format */
const buildTreeData = (items: DeptItem[]): Array<{ key: string; title: string; children?: any[] }> =>
  items.map(item => ({
    key: item.id,
    title: item.name,
    children: item.children?.length ? buildTreeData(item.children) : undefined,
  }))

const UserPage = () => {
  const navigate = useNavigate()
  const deptEnabled = usePublicConfig(s => s.config.deptEnabled)
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange, selectedRowKeys, rowSelection, clearSelection, hasSelected } =
    useTable<UserItem>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const [resetPwdOpen, setResetPwdOpen] = useState(false)
  const [resetPwdLoading, setResetPwdLoading] = useState(false)
  const [resetPwdUserId, setResetPwdUserId] = useState('')
  const [resetPwdForm] = Form.useForm()

  // Dept tree state
  const [deptTreeData, setDeptTreeData] = useState<Array<{ key: string; title: string; children?: any[] }>>([])
  const [deptLoading, setDeptLoading] = useState(false)
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null)
  const [deptPanelVisible, setDeptPanelVisible] = useState(true)

  // Fetch dept tree
  const fetchDeptTree = useCallback(async () => {
    setDeptLoading(true)
    try {
      const { data: result } = await client.get('/api/system/depts/tree') as { error?: unknown; data?: DeptItem[] }
      if (result) {
        setDeptTreeData(buildTreeData(result))
      }
    } finally {
      setDeptLoading(false)
    }
  }, [])

  useEffect(() => { if (deptEnabled) fetchDeptTree() }, [fetchDeptTree, deptEnabled])

  const handleDeptSelect = (selectedKeys: React.Key[]) => {
    const deptId = selectedKeys[0] as string | undefined
    setSelectedDeptId(deptId ?? null)
    if (deptId) {
      onSearch({ ...searchForm.getFieldsValue(), deptId })
    } else {
      onSearch({ ...searchForm.getFieldsValue(), deptId: undefined })
    }
  }

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    onSearch(cleanParams({ ...values, deptId: selectedDeptId ?? undefined }))
  }
  const handleReset = () => {
    searchForm.resetFields()
    setSelectedDeptId(null)
    onReset()
  }

  const openCreate = () => { setEditingUser(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (r: UserItem) => {
    setEditingUser(r)
    form.setFieldsValue({ username: r.username, nickname: r.nickname, email: r.email, phone: r.phone, status: r.status, deptId: r.deptId })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingUser) {
        const { error } = await client.put('/api/system/users/:id', { params: { id: editingUser.id }, body: { nickname: values.nickname, email: values.email, phone: values.phone, status: values.status, deptId: values.deptId } })
        if (!error) { msg.success('更新成功'); setModalOpen(false); refresh() }
      } else {
        const { error } = await client.post('/api/system/users', { body: { username: values.username, password: values.password, nickname: values.nickname, email: values.email, phone: values.phone, status: values.status } })
        if (!error) { msg.success('创建成功'); setModalOpen(false); refresh() }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await client.delete('/api/system/users/:id', { params: { id } })
    if (!error) { msg.success('删除成功'); refresh() }
  }

  const handleStatus = async (id: string, status: number) => {
    const newStatus = status === 1 ? 0 : 1
    const { error } = await client.put('/api/system/users/:id/status', { params: { id }, body: { status: newStatus } })
    if (!error) { msg.success(newStatus === 1 ? '已启用' : '已禁用'); refresh() }
  }

  const openResetPwd = (id: string) => {
    setResetPwdUserId(id)
    resetPwdForm.resetFields()
    setResetPwdOpen(true)
  }

  const handleResetPwdOk = async () => {
    const values = await resetPwdForm.validateFields()
    setResetPwdLoading(true)
    try {
      const { error } = await client.put('/api/system/users/:id/reset-pwd', { params: { id: resetPwdUserId }, body: { newPassword: values.newPassword } })
      if (!error) { msg.success('密码重置成功'); setResetPwdOpen(false) }
    } finally { setResetPwdLoading(false) }
  }

  const columns: ColumnsType<UserItem> = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '昵称', dataIndex: 'nickname', key: 'nickname', width: 120 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: UserItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 200 },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 140 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: UserItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 136, fixed: 'right' as const,
      render: (_: unknown, r: UserItem) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEdit(r) },
          { label: '重置密码', onClick: () => openResetPwd(r.id) },
          { label: r.status === 1 ? '禁用' : '启用', onClick: () => handleStatus(r.id, r.status) },
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该用户？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">用户管理</h3>
      <div className="flex gap-4">
        {/* Dept tree sidebar */}
        {deptEnabled && deptPanelVisible && (
          <Card className="shrink-0" style={{ width: 240 }} styles={{ body: { padding: '12px 16px' } }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">部门筛选</span>
              <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={() => setDeptPanelVisible(false)} />
            </div>
            <Spin spinning={deptLoading}>
              {deptTreeData.length > 0 ? (
                <Tree
                  treeData={deptTreeData}
                  selectedKeys={selectedDeptId ? [selectedDeptId] : []}
                  onSelect={handleDeptSelect}
                  defaultExpandAll
                  showLine={{ showLeafIcon: false }}
                  className="text-sm"
                  style={{ fontSize: 13 }}
                />
              ) : (
                <div className="text-xs text-gray-400 py-4 text-center">暂无部门数据</div>
              )}
            </Spin>
            <div className="mt-2 pt-2 border-t border-gray-100">
              <Button type="link" size="small" icon={<ApartmentOutlined />} onClick={() => navigate('/app/system/depts')} className="text-xs p-0">
                管理部门
              </Button>
            </div>
          </Card>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <Card className="mb-4">
            <Form form={searchForm} layout="inline">
              {deptEnabled && !deptPanelVisible && (
                <Form.Item>
                  <Button icon={<MenuUnfoldOutlined />} onClick={() => setDeptPanelVisible(true)} />
                </Form.Item>
              )}
              <Form.Item name="username"><Input placeholder="用户名" prefix={<SearchOutlined />} /></Form.Item>
              <Form.Item name="status">
                <DictSelect typeCode="sys_status" placeholder="状态" allowClear style={{ width: 100 }} />
              </Form.Item>
              <Space>
                <Button type="primary" onClick={handleSearch}>搜索</Button>
                <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
              </Space>
            </Form>
          </Card>
          <Card title={`用户列表（${total}）`}
            extra={<Space><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button></Space>}>
            {hasSelected && <div className="mb-2 text-sm text-gray-500">已选 {selectedRowKeys.length} 项 <Button type="link" size="small" onClick={clearSelection}>取消选择</Button></div>}
            <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small"
              pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
              scroll={{ x: 1200 }} rowSelection={rowSelection} />
          </Card>
        </div>
      </div>
      <Modal title={editingUser ? '编辑用户' : '新增用户'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnHidden width={640}>
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}><Input disabled={!!editingUser} /></Form.Item>
            </Col>
            {!editingUser && <Col span={12}>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}><Input.Password /></Form.Item>
            </Col>}
            <Col span={12}>
              <Form.Item name="nickname" label="昵称"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <DictSelect typeCode="sys_status" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="手机号" rules={[{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }]}><Input /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
      <Modal title="重置密码" open={resetPwdOpen} onOk={handleResetPwdOk} onCancel={() => setResetPwdOpen(false)} confirmLoading={resetPwdLoading} destroyOnHidden width={480}>
        <Form form={resetPwdForm} layout="vertical" preserve={false}>
          <Form.Item name="newPassword" label="新密码" rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '密码长度至少8位' },
            { pattern: /^(?=.*[a-zA-Z])(?=.*\d)|(?=.*[a-zA-Z])(?=.*[^a-zA-Z0-9])|(?=.*\d)(?=.*[^a-zA-Z0-9]).+$/, message: '密码需包含字母、数字、特殊字符中的至少两种' },
          ]}><Input.Password placeholder="请输入新密码" /></Form.Item>
          <Form.Item name="confirmPassword" label="确认密码" dependencies={['newPassword']} rules={[
            { required: true, message: '请确认密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('newPassword') === value) return Promise.resolve()
                return Promise.reject(new Error('两次输入的密码不一致'))
              },
            }),
          ]}><Input.Password placeholder="请再次输入新密码" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default UserPage
