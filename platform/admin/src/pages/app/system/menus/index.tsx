import { useEffect, useState, useCallback } from 'react'
import { Card, Table, Button, Form, Input, Select, Modal, Space, Tag, message, Popconfirm } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { MenuItem } from '@/api/types'

const MenuPage = () => {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<MenuItem[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMenu, setEditingMenu] = useState<MenuItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { error, data: tree } = await client.get<MenuItem[]>('/api/system/menus')
      if (!error) setData(tree ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = (parent?: MenuItem) => {
    setEditingMenu(null); form.resetFields()
    form.setFieldsValue({ type: parent ? 2 : 1, sort: 0, visible: true, status: 1, parentId: parent?.id })
    setModalOpen(true)
  }

  const openEdit = (r: MenuItem) => {
    setEditingMenu(r)
    form.setFieldsValue({ parentId: r.parentId, name: r.name, path: r.path, component: r.component, redirect: r.redirect, type: r.type, permission: r.permission, icon: r.icon, sort: r.sort, visible: r.visible, status: r.status })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingMenu) {
        const { error } = await client.put(`/api/system/menus/${editingMenu.id}`, { body: values })
        if (!error) { message.success('更新成功'); setModalOpen(false); fetchData() }
      } else {
        const { error } = await client.post('/api/system/menus', { body: values })
        if (!error) { message.success('创建成功'); setModalOpen(false); fetchData() }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await client.delete(`/api/system/menus/${id}`)
    if (!error) { message.success('删除成功'); fetchData() }
  }

  const typeMap: Record<number, string> = { 1: '目录', 2: '菜单', 3: '按钮' }
  const typeColor: Record<number, string> = { 1: 'blue', 2: 'green', 3: 'orange' }

  const columns = [
    { title: '菜单名称', dataIndex: 'name', key: 'name' },
    { title: '图标', dataIndex: 'icon', key: 'icon', width: 80 },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80, render: (_: unknown, r: MenuItem) => <Tag color={typeColor[r.type]}>{typeMap[r.type]}</Tag> },
    { title: '路由地址', dataIndex: 'path', key: 'path', width: 200 },
    { title: '权限标识', dataIndex: 'permission', key: 'permission', width: 180 },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (_: unknown, r: MenuItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '操作', key: 'action', width: 220,
      render: (_: unknown, r: MenuItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openCreate(r)}>添加子菜单</Button>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该菜单？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">菜单管理</h3>
      <Card title="菜单列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>新增菜单</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 1000 }} defaultExpandAllRows />
      </Card>
      <Modal title={editingMenu ? '编辑菜单' : '新增菜单'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnClose width={600}>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="parentId" label="上级菜单">
            <Select allowClear placeholder="顶级菜单">{data.map(m => <Select.Option key={m.id} value={m.id}>{m.name}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="name" label="菜单名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type" label="菜单类型" rules={[{ required: true }]}>
            <Select><Select.Option value={1}>目录</Select.Option><Select.Option value={2}>菜单</Select.Option><Select.Option value={3}>按钮</Select.Option></Select>
          </Form.Item>
          <Form.Item name="path" label="路由地址"><Input placeholder="/system/user" /></Form.Item>
          <Form.Item name="component" label="组件路径"><Input placeholder="system/user/index" /></Form.Item>
          <Form.Item name="permission" label="权限标识"><Input placeholder="system:user:list" /></Form.Item>
          <Form.Item name="icon" label="图标"><Input placeholder="setting" /></Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}><Input type="number" /></Form.Item>
          <Form.Item name="visible" label="是否显示" initialValue={true}><Select><Select.Option value={true}>显示</Select.Option><Select.Option value={false}>隐藏</Select.Option></Select></Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}><Select><Select.Option value={1}>正常</Select.Option><Select.Option value={0}>禁用</Select.Option></Select></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MenuPage
