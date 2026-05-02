import { useState } from 'react'
import { Card, Table, Button, Input, Select, Form, Modal, Space, Tag, message, Row, Col, Tree } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { client } from '@/api'
import type { PaginatedData, RoleItem, MenuItem } from '@/api/types'
import { useTable } from '@/hooks/useTable'
import ActionColumn from '@/components/ActionColumn'

const cleanParams = (params: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/roles', { query: cleanParams(params) }) as Promise<{ error?: unknown; data?: PaginatedData<RoleItem> }>

const fmtDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'

/** 将 MenuItem[] 转为 Ant Design TreeData */
function toTreeData(items: MenuItem[]): any[] {
  return items.map(item => ({
    key: item.id,
    title: item.name,
    children: item.children?.length ? toTreeData(item.children) : undefined,
  }))
}

/** 收集所有节点 key（含子级） */
function collectAllKeys(items: MenuItem[]): string[] {
  const keys: string[] = []
  for (const item of items) {
    keys.push(item.id)
    if (item.children?.length) keys.push(...collectAllKeys(item.children))
  }
  return keys
}

/** 获取某 key 的所有子孙 key */
function getDescendantKeys(items: MenuItem[], targetKey: string): string[] {
  for (const item of items) {
    if (item.id === targetKey) {
      return collectAllKeys(item.children ?? [])
    }
    if (item.children?.length) {
      const found = getDescendantKeys(item.children, targetKey)
      if (found.length) return found
    }
  }
  return []
}

const RolePage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange } =
    useTable<RoleItem>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()
  const [menuModalOpen, setMenuModalOpen] = useState(false)
  const [menuTree, setMenuTree] = useState<MenuItem[]>([])
  const [checkedKeys, setCheckedKeys] = useState<string[]>([])
  const [assignRoleId, setAssignRoleId] = useState('')

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    onSearch(cleanParams(values))
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const openCreate = () => { setEditingRole(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (r: RoleItem) => {
    setEditingRole(r)
    form.setFieldsValue({ name: r.name, code: r.code, sort: r.sort, dataScope: r.dataScope, remark: r.remark, status: r.status })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingRole) {
        await client.put(`/api/system/roles/${editingRole.id}` as '/api/system/roles/:id', { body: { name: values.name, sort: values.sort, remark: values.remark, status: values.status } })
        message.success('更新成功'); setModalOpen(false); refresh()
      } else {
        await client.post('/api/system/roles', { body: { name: values.name, code: values.code, sort: values.sort, remark: values.remark } })
        message.success('创建成功'); setModalOpen(false); refresh()
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    await client.delete(`/api/system/roles/${id}` as '/api/system/roles/:id')
    message.success('删除成功'); refresh()
  }

  const openAssignMenus = async (r: RoleItem) => {
    setAssignRoleId(r.id)
    const res = await client.get('/api/system/menus/tree' as '/api/system/menus/tree') as { error?: unknown; data?: MenuItem[] }
    setMenuTree(res.data ?? [])
    setCheckedKeys([])
    setMenuModalOpen(true)
  }

  const handleCheck = (checked: any, info: any) => {
    const keys = (checked as string[]) ?? []
    const currentKey = info.node?.key as string
    if (info.checked && currentKey) {
      // 勾选父级时自动勾选所有子级
      const descKeys = getDescendantKeys(menuTree, currentKey)
      if (descKeys.length > 0) {
        const merged = new Set([...keys, ...descKeys])
        setCheckedKeys([...merged])
        return
      }
    }
    setCheckedKeys(keys)
  }

  const handleAssignMenus = async () => {
    await client.put(`/api/system/roles/${assignRoleId}/menus` as '/api/system/roles/:id/menus', { body: { menuIds: checkedKeys } })
    message.success('菜单权限分配成功'); setMenuModalOpen(false)
  }

  const columns: ColumnsType<RoleItem> = [
    { title: '角色名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '角色标识', dataIndex: 'code', key: 'code', width: 160 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: RoleItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: RoleItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, r: RoleItem) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEdit(r) },
          { label: '分配菜单', onClick: () => openAssignMenus(r) },
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该角色？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">角色管理</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name"><Input placeholder="角色名称" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="status">
            <Select placeholder="状态" allowClear style={{ width: 100 }}>
              <Select.Option value={1}>正常</Select.Option>
              <Select.Option value={0}>禁用</Select.Option>
            </Select>
          </Form.Item>
          <Space><Button type="primary" onClick={handleSearch}>搜索</Button><Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button></Space>
        </Form>
      </Card>
      <Card title={`角色列表（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增角色</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1000 }} />
      </Card>
      <Modal title={editingRole ? '编辑角色' : '新增角色'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnHidden width={640}>
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="角色名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="code" label="角色标识" rules={[{ required: true }]}><Input disabled={!!editingRole} /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <Select><Select.Option value={1}>正常</Select.Option><Select.Option value={0}>禁用</Select.Option></Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sort" label="排序" initialValue={0}><Input type="number" /></Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
      <Modal title="分配菜单权限" open={menuModalOpen} onOk={handleAssignMenus} onCancel={() => setMenuModalOpen(false)} destroyOnHidden width={480}>
        {menuTree.length > 0 && (
          <Tree
            checkable
            defaultExpandAll
            checkedKeys={checkedKeys}
            onCheck={handleCheck}
            treeData={toTreeData(menuTree)}
          />
        )}
      </Modal>
    </div>
  )
}

export default RolePage
