import { useEffect, useState, useCallback } from 'react'
import { Card, Table, Button, Form, Input, InputNumber, Select, Modal, Tag, message, Row, Col } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { client } from '@/api'
import type { MenuItem } from '@/api/types'
import ActionColumn from '@/components/ActionColumn'
import { resolveIcon } from '@/utils/icon'

const fmtDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'

/** 常用图标列表（使用 @ant-design/icons 完整名称） */
const iconOptions = [
  'SettingOutlined', 'UserOutlined', 'TeamOutlined', 'MenuOutlined', 'HomeOutlined', 'DashboardOutlined',
  'AppstoreOutlined', 'DatabaseOutlined', 'FileOutlined', 'FolderOutlined', 'LockOutlined', 'KeyOutlined',
  'BellOutlined', 'MailOutlined', 'PhoneOutlined', 'SearchOutlined', 'PlusOutlined', 'MinusOutlined',
  'EditOutlined', 'DeleteOutlined', 'EyeOutlined', 'EyeInvisibleOutlined', 'UploadOutlined', 'DownloadOutlined',
  'CheckOutlined', 'CloseOutlined', 'InfoCircleOutlined', 'WarningOutlined', 'ExclamationCircleOutlined',
  'QuestionCircleOutlined', 'CalendarOutlined', 'ClockOutlined', 'StarOutlined', 'HeartOutlined',
  'LikeOutlined', 'DislikeOutlined', 'ShareAltOutlined', 'LinkOutlined', 'BookOutlined', 'ReadOutlined',
  'ProfileOutlined', 'SolutionOutlined', 'AuditOutlined', 'SafetyCertificateOutlined',
  'TransactionOutlined', 'DollarOutlined', 'FundOutlined', 'ShopOutlined', 'ShoppingOutlined',
  'ToolOutlined', 'BuildOutlined', 'CodeOutlined', 'BugOutlined', 'ExperimentOutlined', 'ApiOutlined',
  'CloudOutlined', 'ServerOutlined', 'GlobalOutlined', 'EnvironmentOutlined', 'CompassOutlined',
  'SwitcherOutlined', 'GatewayOutlined', 'MonitorOutlined', 'PrinterOutlined', 'ScanOutlined',
  'QrcodeOutlined', 'BarChartOutlined', 'PieChartOutlined', 'LineChartOutlined', 'AreaChartOutlined',
  'FundProjectionScreenOutlined',
]

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
      const res = await client.get('/api/system/menus/tree' as '/api/system/menus/tree') as { data?: MenuItem[] }
      setData(res.data ?? [])
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
        await client.put(`/api/system/menus/${editingMenu.id}` as '/api/system/menus/:id', { body: values })
        message.success('更新成功'); setModalOpen(false); fetchData()
      } else {
        await client.post('/api/system/menus', { body: values })
        message.success('创建成功'); setModalOpen(false); fetchData()
      }
    } finally { setModalLoading(false) }
  }

  const handleDelete = async (id: string) => {
    await client.delete(`/api/system/menus/${id}` as '/api/system/menus/:id')
    message.success('删除成功'); fetchData()
  }

  const typeMap: Record<number, string> = { 1: '目录', 2: '菜单', 3: '按钮' }
  const typeColor: Record<number, string> = { 1: 'blue', 2: 'green', 3: 'orange' }

  const columns: ColumnsType<MenuItem> = [
    { title: '菜单名称', dataIndex: 'name', key: 'name' },
    { title: '图标', dataIndex: 'icon', key: 'icon', width: 80,
      render: (_: unknown, r: MenuItem) => {
        if (!r.icon) return '-'
        const IconComp = resolveIcon(r.icon)
        return IconComp ? <span className="text-lg"><IconComp /></span> : r.icon
      }},
    { title: '类型', dataIndex: 'type', key: 'type', width: 80, render: (_: unknown, r: MenuItem) => <Tag color={typeColor[r.type]}>{typeMap[r.type]}</Tag> },
    { title: '路由地址', dataIndex: 'path', key: 'path', width: 200 },
    { title: '权限标识', dataIndex: 'permission', key: 'permission', width: 180 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (_: unknown, r: MenuItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: MenuItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 176, fixed: 'right' as const,
      render: (_: unknown, r: MenuItem) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEdit(r) },
          { label: '添加子菜单', onClick: () => openCreate(r) },
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该菜单？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">菜单管理</h3>
      <Card title="菜单列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>新增菜单</Button>}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 1200 }} defaultExpandAllRows expandable={{ rowExpandable: (r) => r.type !== 3 }} />
      </Card>
      <Modal title={editingMenu ? '编辑菜单' : '新增菜单'} open={modalOpen} onOk={handleOk} onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnHidden width={640}>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="parentId" label="上级菜单">
            <Select allowClear placeholder="顶级菜单">{data.map(m => <Select.Option key={m.id} value={m.id}>{m.name}</Select.Option>)}</Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="菜单名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="菜单类型" rules={[{ required: true }]}>
                <Select><Select.Option value={1}>目录</Select.Option><Select.Option value={2}>菜单</Select.Option><Select.Option value={3}>按钮</Select.Option></Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="path" label="路由地址"><Input placeholder="/system/users" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="component" label="组件路径"><Input placeholder="system/users/index" /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="permission" label="权限标识"><Input placeholder="system:user:list" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="icon" label="图标">
                <Select allowClear showSearch placeholder="选择图标" optionFilterProp="label"
                  options={iconOptions.map(name => {
                    const IconComp = resolveIcon(name)
                    return { label: IconComp ? <span className="inline-flex items-center gap-1"><IconComp /> {name}</span> : name, value: name }
                  })} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="sort" label="排序" initialValue={0}><InputNumber className="w-full" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="visible" label="是否显示" initialValue={true}><Select><Select.Option value={true}>显示</Select.Option><Select.Option value={false}>隐藏</Select.Option></Select></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态" initialValue={1}><Select><Select.Option value={1}>正常</Select.Option><Select.Option value={0}>禁用</Select.Option></Select></Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default MenuPage
