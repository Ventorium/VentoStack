import { useState } from 'react'
import { Card, Table, Button, Input, Form, Modal, Space, Tag, Row, Col, Tree } from 'antd'
import { msg } from '@/components/GlobalMessage'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { PaginatedData, RoleItem, MenuItem } from '@/api/types'
import { useTable } from '@/hooks/useTable'
import { cleanParams } from '@/utils/cleanParams'
import { fmtDate } from '@/utils/fmtDate'
import ActionColumn from '@/components/ActionColumn'
import DictSelect from '@/components/DictSelect'

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/roles', { query: cleanParams(params) }) as Promise<{ error?: unknown; data?: PaginatedData<RoleItem> }>

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
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange, selectedRowKeys, rowSelection, clearSelection, hasSelected } =
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
  const [assignRoleCode, setAssignRoleCode] = useState('')

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
        const { error } = await client.put('/api/system/roles/:id', { params: { id: editingRole.id }, body: { name: values.name, sort: values.sort, remark: values.remark, status: values.status } })
        if (!error) { msg.success('更新成功'); setModalOpen(false); refresh() }
      } else {
        const { error } = await client.post('/api/system/roles', { body: { name: values.name, code: values.code, sort: values.sort, remark: values.remark } })
        if (!error) { msg.success('创建成功'); setModalOpen(false); refresh() }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await client.delete('/api/system/roles/:id', { params: { id } })
    if (!error) { msg.success('删除成功'); refresh() }
  }

  const openAssignMenus = async (r: RoleItem) => {
    setAssignRoleId(r.id)
    setAssignRoleCode(r.code)
    const res = await client.get('/api/system/menus/tree') as { error?: unknown; data?: MenuItem[] }
    const tree = res.data ?? []
    setMenuTree(tree)
    // admin 角色默认全选
    setCheckedKeys(isBuiltInRole(r.code) ? collectAllKeys(tree) : [])
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
    const { error } = await client.put('/api/system/roles/:id/menus', { params: { id: assignRoleId }, body: { menuIds: checkedKeys } })
    if (!error) { msg.success('菜单权限分配成功'); setMenuModalOpen(false) }
  }

  const isBuiltInRole = (code: string) => code === 'admin'

  const columns: ColumnsType<RoleItem> = [
    { title: '角色名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '角色标识', dataIndex: 'code', key: 'code', width: 160 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: RoleItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: RoleItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, r: RoleItem) => {
        const builtIn = isBuiltInRole(r.code)
        return (
          <ActionColumn items={[
            { label: '编辑', onClick: () => openEdit(r), disabled: builtIn },
            { label: '分配菜单', onClick: () => openAssignMenus(r) },
            { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该角色？', disabled: builtIn },
          ]} />
        )
      } },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">角色管理</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name"><Input placeholder="角色名称" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="status">
            <DictSelect typeCode="sys_status" placeholder="状态" allowClear style={{ width: 100 }} />
          </Form.Item>
          <Space><Button type="primary" onClick={handleSearch}>搜索</Button><Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button></Space>
        </Form>
      </Card>
      <Card title={`角色列表（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增角色</Button>}>
        {hasSelected && <div className="mb-2 text-sm text-gray-500">已选 {selectedRowKeys.length} 项 <Button type="link" size="small" onClick={clearSelection}>取消选择</Button></div>}
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small"
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1000 }} rowSelection={rowSelection} />
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
                <DictSelect typeCode="sys_status" />
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
      <Modal title="分配菜单权限" open={menuModalOpen} onOk={isBuiltInRole(assignRoleCode) ? () => setMenuModalOpen(false) : handleAssignMenus} onCancel={() => setMenuModalOpen(false)} okText={isBuiltInRole(assignRoleCode) ? '关闭' : '确定'} destroyOnHidden width={480}>
        {isBuiltInRole(assignRoleCode) && <p className="text-gray-500 mb-2">内置超级管理员角色拥有所有权限</p>}
        {menuTree.length > 0 && (
          <Tree
            checkable
            defaultExpandAll
            checkedKeys={checkedKeys}
            onCheck={isBuiltInRole(assignRoleCode) ? () => {} : handleCheck}
            selectable={false}
            treeData={toTreeData(menuTree)}
          />
        )}
      </Modal>
    </div>
  )
}

export default RolePage
