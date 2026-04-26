import { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Button, Form, Input, InputNumber, Modal, Space, Tag, message, Popconfirm,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { deptApi } from '@/api/system'
import type { DeptItem, CreateDeptBody, UpdateDeptBody } from '@/api/types'

const DeptPage = () => {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<DeptItem[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<DeptItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { error, data: tree } = await deptApi.getTree()
      if (!error) setData(tree ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = (parent?: DeptItem) => {
    setEditingDept(null)
    form.resetFields()
    if (parent) form.setFieldsValue({ parentId: parent.id })
    form.setFieldsValue({ sort: 0, status: 1 })
    setModalOpen(true)
  }

  const openEdit = (record: DeptItem) => {
    setEditingDept(record)
    form.setFieldsValue({
      parentId: record.parentId,
      name: record.name,
      sort: record.sort,
      leader: record.leader,
      phone: record.phone,
      email: record.email,
      status: record.status,
    })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingDept) {
        const body: UpdateDeptBody = {
          name: values.name, sort: values.sort, leader: values.leader,
          phone: values.phone, email: values.email, status: values.status,
        }
        const { error } = await deptApi.update(editingDept.id, body)
        if (!error) { message.success('更新成功'); setModalOpen(false); fetchData() }
      } else {
        const body: CreateDeptBody = {
          parentId: values.parentId, name: values.name, sort: values.sort ?? 0,
          leader: values.leader, phone: values.phone, email: values.email,
        }
        const { error } = await deptApi.create(body)
        if (!error) { message.success('创建成功'); setModalOpen(false); fetchData() }
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    const { error } = await deptApi.delete(id)
    if (!error) { message.success('删除成功'); fetchData() }
  }

  const columns = [
    { title: '部门名称', dataIndex: 'name', key: 'name' },
    { title: '负责人', dataIndex: 'leader', key: 'leader', width: 120 },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 140 },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 200 },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: DeptItem) => (
        <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作', key: 'action', width: 220,
      render: (_: unknown, r: DeptItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openCreate(r)}>新增子部门</Button>
          <Button type="link" size="small" onClick={() => openEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该部门？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">部门管理</h3>
      <Card
        title="部门列表"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>新增部门</Button>}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={false}
          scroll={{ x: 900 }}
          defaultExpandAllRows
        />
      </Card>

      <Modal
        title={editingDept ? '编辑部门' : '新增部门'}
        open={modalOpen}
        onOk={handleOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={modalLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="parentId" label="上级部门">
            <Input placeholder="留空为顶级部门" />
          </Form.Item>
          <Form.Item name="name" label="部门名称" rules={[{ required: true, message: '请输入部门名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}>
            <InputNumber className="w-full" />
          </Form.Item>
          <Form.Item name="leader" label="负责人">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}>
            <Input placeholder="1=正常 0=禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DeptPage
