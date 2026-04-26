import { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Button, Input, Select, Form, Modal, Space, Tag, message, Popconfirm,
} from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { roleApi, menuApi } from '@/api/system'
import type { RoleItem, CreateRoleBody, UpdateRoleBody } from '@/api/types'

const RolePage = () => {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<RoleItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchForm] = Form.useForm()

  // crud modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  // menu assignment modal
  const [menuModalOpen, setMenuModalOpen] = useState(false)
  const [menuTree, setMenuTree] = useState<any[]>([])
  const [selectedMenus, setSelectedMenus] = useState<string[]>([])
  const [assignRoleId, setAssignRoleId] = useState<string>('')

  const fetchData = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true)
    try {
      const values = await searchForm.validateFields().catch(() => ({}))
      const { error, data: result } = await roleApi.list({ page: p, pageSize: ps, ...values })
      if (!error && result) {
        setData(result.list)
        setTotal(result.total)
        setPage(result.page)
        setPageSize(result.pageSize)
      }
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchForm])

  useEffect(() => { fetchData(1, pageSize) }, [])

  const onSearch = () => fetchData(1, pageSize)
  const onReset = () => { searchForm.resetFields(); fetchData(1, pageSize) }
  const onPageChange = (p: number, ps: number) => fetchData(p, ps)

  const openCreate = () => {
    setEditingRole(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: RoleItem) => {
    setEditingRole(record)
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      sort: record.sort,
      dataScope: record.dataScope,
      remark: record.remark,
      status: record.status,
    })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingRole) {
        const body: UpdateRoleBody = {
          name: values.name,
          sort: values.sort,
          remark: values.remark,
          status: values.status,
        }
        const { error } = await roleApi.update(editingRole.id, body)
        if (!error) {
          message.success('更新成功')
          setModalOpen(false)
          fetchData(page, pageSize)
        }
      } else {
        const body: CreateRoleBody = {
          name: values.name,
          code: values.code,
          sort: values.sort,
          remark: values.remark,
        }
        const { error } = await roleApi.create(body)
        if (!error) {
          message.success('创建成功')
          setModalOpen(false)
          fetchData(page, pageSize)
        }
      }
    } finally {
      setModalLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await roleApi.delete(id)
    if (!error) {
      message.success('删除成功')
      fetchData(page, pageSize)
    }
  }

  // 分配菜单权限
  const openAssignMenus = async (record: RoleItem) => {
    setAssignRoleId(record.id)
    const { data: menus } = await menuApi.getTree()
    setMenuTree(menus ?? [])
    setSelectedMenus([])
    setMenuModalOpen(true)
  }

  const handleAssignMenus = async () => {
    const { error } = await roleApi.assignMenus(assignRoleId, selectedMenus)
    if (!error) {
      message.success('菜单权限分配成功')
      setMenuModalOpen(false)
    }
  }

  const columns = [
    { title: '角色名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '角色标识', dataIndex: 'code', key: 'code', width: 160 },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: RoleItem) => (
        <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag>
      ),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    {
      title: '操作', key: 'action', width: 280,
      render: (_: unknown, r: RoleItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Button type="link" size="small" onClick={() => openAssignMenus(r)}>分配菜单</Button>
          <Popconfirm title="确定删除该角色？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // build menu tree checkable nodes
  function buildMenuCheckable(menus: any[]): any[] {
    return menus.map(m => ({
      key: m.id,
      title: m.name,
      children: m.children?.length ? buildMenuCheckable(m.children) : undefined,
    }))
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">角色管理</h3>

      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name">
            <Input placeholder="角色名称" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态" allowClear style={{ width: 120 }}>
              <Select.Option value={1}>正常</Select.Option>
              <Select.Option value={0}>禁用</Select.Option>
            </Select>
          </Form.Item>
          <Space>
            <Button type="primary" onClick={onSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button>
          </Space>
        </Form>
      </Card>

      <Card
        title={`角色列表（${total}）`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增角色</Button>}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            showTotal: t => `共 ${t} 条`, onChange: onPageChange,
          }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="角色标识" rules={[{ required: true, message: '请输入角色标识' }]}>
            <Input disabled={!!editingRole} />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}>
            <Select>
              <Select.Option value={1}>正常</Select.Option>
              <Select.Option value={0}>禁用</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Assign Menu Modal */}
      <Modal
        title="分配菜单权限"
        open={menuModalOpen}
        onOk={handleAssignMenus}
        onCancel={() => setMenuModalOpen(false)}
        destroyOnClose
      >
        {menuTree.length > 0 && (
          <div className="max-h-96 overflow-auto">
            {/* Simple checkbox tree rendering */}
            {renderMenuTreeCheckboxes(menuTree, selectedMenus, setSelectedMenus)}
          </div>
        )}
      </Modal>
    </div>
  )
}

// recursive menu tree checkboxes
function renderMenuTreeCheckboxes(
  items: any[],
  selected: string[],
  onChange: (ids: string[]) => void,
): React.ReactNode {
  return (
    <ul className="list-none pl-0">
      {items.map(item => (
        <li key={item.id} className="py-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...selected, item.id])
                } else {
                  onChange(selected.filter(id => id !== item.id))
                }
              }}
            />
            <span>{item.name}</span>
          </label>
          {item.children?.length > 0 && (
            <div className="ml-6">
              {renderMenuTreeCheckboxes(item.children, selected, onChange)}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export default RolePage
