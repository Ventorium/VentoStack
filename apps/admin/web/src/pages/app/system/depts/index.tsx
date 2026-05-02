import { useEffect, useState, useCallback } from 'react'
import { Card, Table, Button, Form, Input, InputNumber, Select, Modal, Tag, message, Row, Col, TreeSelect } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { client } from '@/api'
import type { DeptItem } from '@/api/types'
import ActionColumn from '@/components/ActionColumn'

const fmtDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'

function toTreeSelectData(items: DeptItem[]): any[] {
  return items.map(item => ({
    value: item.id,
    title: item.name,
    children: item.children?.length ? toTreeSelectData(item.children) : undefined,
  }))
}

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
      const res = await client.get('/api/system/depts/tree' as '/api/system/depts/tree') as { data?: DeptItem[] }
      setData(res.data ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = (parent?: DeptItem) => {
    setEditingDept(null); form.resetFields(); form.setFieldsValue({ sort: 0, status: 1, parentId: parent?.id })
    setModalOpen(true)
  }

  const openEdit = (r: DeptItem) => {
    setEditingDept(r)
    form.setFieldsValue({ parentId: r.parentId, name: r.name, sort: r.sort, leader: r.leader, phone: r.phone, email: r.email, status: r.status })
    setModalOpen(true)
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingDept) {
        await client.put(`/api/system/depts/${editingDept.id}` as '/api/system/depts/:id', { body: values })
        message.success('更新成功'); setModalOpen(false); fetchData()
      } else {
        await client.post('/api/system/depts', { body: values })
        message.success('创建成功'); setModalOpen(false); fetchData()
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    await client.delete(`/api/system/depts/${id}` as '/api/system/depts/:id')
    message.success('删除成功'); fetchData()
  }

  const columns: ColumnsType<DeptItem> = [
    { title: '部门名称', dataIndex: 'name', key: 'name' },
    { title: '负责人', dataIndex: 'leader', key: 'leader', width: 120 },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 140 },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 200 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (_: unknown, r: DeptItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: DeptItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 180, fixed: 'right' as const,
      render: (_: unknown, r: DeptItem) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEdit(r) },
          { label: '新增子部门', onClick: () => openCreate(r) },
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该部门？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">部门管理</h3>
      <Card title="部门列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>新增部门</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 1100 }} defaultExpandAllRows />
      </Card>
      <Modal title={editingDept ? '编辑部门' : '新增部门'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnHidden width={640}>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="parentId" label="上级部门">
            <TreeSelect allowClear treeDefaultExpandAll placeholder="留空为顶级部门" treeData={toTreeSelectData(data)} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="部门名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="leader" label="负责人"><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="电话"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="邮箱"><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <Select><Select.Option value={1}>正常</Select.Option><Select.Option value={0}>禁用</Select.Option></Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sort" label="排序" initialValue={0}><InputNumber className="w-full" /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default DeptPage
