import { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Button, Input, Form, Modal, Space, Tag, message, Popconfirm, Select,
} from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { dictApi } from '@/api/system'
import type { DictTypeItem, DictDataItem, CreateDictTypeBody, UpdateDictTypeBody } from '@/api/types'

const DictPage = () => {
  // === Dict Types ===
  const [typeLoading, setTypeLoading] = useState(false)
  const [typeData, setTypeData] = useState<DictTypeItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchForm] = Form.useForm()

  const [typeModalOpen, setTypeModalOpen] = useState(false)
  const [editingType, setEditingType] = useState<DictTypeItem | null>(null)
  const [typeModalLoading, setTypeModalLoading] = useState(false)
  const [typeForm] = Form.useForm()

  // === Dict Data ===
  const [dataModalOpen, setDataModalOpen] = useState(false)
  const [currentTypeCode, setCurrentTypeCode] = useState('')
  const [dictData, setDictData] = useState<DictDataItem[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [editingData, setEditingData] = useState<DictDataItem | null>(null)
  const [dataModalLoading, setDataModalLoading] = useState(false)
  const [dataForm] = Form.useForm()

  const fetchTypes = useCallback(async (p = page, ps = pageSize) => {
    setTypeLoading(true)
    try {
      const values = await searchForm.validateFields().catch(() => ({}))
      const { error, data: result } = await dictApi.listTypes({ page: p, pageSize: ps, ...values })
      if (!error && result) {
        setTypeData(result.list); setTotal(result.total)
        setPage(result.page); setPageSize(result.pageSize)
      }
    } finally { setTypeLoading(false) }
  }, [page, pageSize, searchForm])

  useEffect(() => { fetchTypes(1, pageSize) }, [])

  const onSearch = () => fetchTypes(1, pageSize)
  const onReset = () => { searchForm.resetFields(); fetchTypes(1, pageSize) }
  const onPageChange = (p: number, ps: number) => fetchTypes(p, ps)

  // Type CRUD
  const openCreateType = () => { setEditingType(null); typeForm.resetFields(); setTypeModalOpen(true) }
  const openEditType = (r: DictTypeItem) => {
    setEditingType(r)
    typeForm.setFieldsValue({ name: r.name, code: r.code, remark: r.remark, status: r.status })
    setTypeModalOpen(true)
  }

  const handleTypeOk = async () => {
    const values = await typeForm.validateFields()
    setTypeModalLoading(true)
    try {
      if (editingType) {
        const body: UpdateDictTypeBody = { name: values.name, remark: values.remark, status: values.status }
        const { error } = await dictApi.updateType(editingType.code, body)
        if (!error) { message.success('更新成功'); setTypeModalOpen(false); fetchTypes(page, pageSize) }
      } else {
        const body: CreateDictTypeBody = { name: values.name, code: values.code, remark: values.remark }
        const { error } = await dictApi.createType(body)
        if (!error) { message.success('创建成功'); setTypeModalOpen(false); fetchTypes(page, pageSize) }
      }
    } finally { setTypeModalLoading(false) }
  }

  const handleDeleteType = async (code: string) => {
    const { error } = await dictApi.deleteType(code)
    if (!error) { message.success('删除成功'); fetchTypes(page, pageSize) }
  }

  // Dict Data
  const openDictData = async (typeCode: string) => {
    setCurrentTypeCode(typeCode)
    setDataLoading(true)
    const { error, data } = await dictApi.listDataByType(typeCode)
    if (!error) setDictData(data ?? [])
    setDataLoading(false)
    setDataModalOpen(true)
  }

  const openCreateData = () => {
    setEditingData(null)
    dataForm.resetFields()
    dataForm.setFieldsValue({ typeCode: currentTypeCode })
    setDataModalOpen(true)
  }

  // We need a separate modal for data CRUD since it's within a modal
  const [dataEditModalOpen, setDataEditModalOpen] = useState(false)

  const openEditData = (r: DictDataItem) => {
    setEditingData(r)
    dataForm.setFieldsValue({
      typeCode: r.typeCode, label: r.label, value: r.value,
      sort: r.sort, cssClass: r.cssClass, status: r.status, remark: r.remark,
    })
    setDataEditModalOpen(true)
  }

  const handleDataOk = async () => {
    const values = await dataForm.validateFields()
    setDataModalLoading(true)
    try {
      if (editingData) {
        const { error } = await dictApi.updateData(editingData.id, values)
        if (!error) {
          message.success('更新成功'); setDataEditModalOpen(false)
          const { data } = await dictApi.listDataByType(currentTypeCode)
          setDictData(data ?? [])
        }
      } else {
        const { error } = await dictApi.createData(values)
        if (!error) {
          message.success('创建成功'); setDataEditModalOpen(false)
          const { data } = await dictApi.listDataByType(currentTypeCode)
          setDictData(data ?? [])
        }
      }
    } finally { setDataModalLoading(false) }
  }

  const handleDeleteData = async (id: string) => {
    const { error } = await dictApi.deleteData(id)
    if (!error) {
      message.success('删除成功')
      const { data } = await dictApi.listDataByType(currentTypeCode)
      setDictData(data ?? [])
    }
  }

  const typeColumns = [
    { title: '字典名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '字典标识', dataIndex: 'code', key: 'code', width: 160 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: DictTypeItem) => (
        <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag>
      ),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    {
      title: '操作', key: 'action', width: 250,
      render: (_: unknown, r: DictTypeItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openDictData(r.code)}>字典数据</Button>
          <Button type="link" size="small" onClick={() => openEditType(r)}>编辑</Button>
          <Popconfirm title="确定删除该字典类型？" onConfirm={() => handleDeleteType(r.code)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const dataColumns = [
    { title: '标签', dataIndex: 'label', key: 'label', width: 140 },
    { title: '值', dataIndex: 'value', key: 'value', width: 140 },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    { title: '样式', dataIndex: 'cssClass', key: 'cssClass', width: 100 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: DictDataItem) => (
        <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作', key: 'action', width: 160,
      render: (_: unknown, r: DictDataItem) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEditData(r)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteData(r.id)}>
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">字典管理</h3>

      {/* Types */}
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name">
            <Input placeholder="字典名称" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="code">
            <Input placeholder="字典标识" />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={onSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={onReset}>重置</Button>
          </Space>
        </Form>
      </Card>

      <Card
        title={`字典类型（${total}）`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreateType}>新增字典</Button>}
      >
        <Table
          rowKey="id" columns={typeColumns} dataSource={typeData} loading={typeLoading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* Dict Type Modal */}
      <Modal
        title={editingType ? '编辑字典类型' : '新增字典类型'}
        open={typeModalOpen}
        onOk={handleTypeOk}
        onCancel={() => setTypeModalOpen(false)}
        confirmLoading={typeModalLoading}
        destroyOnClose
      >
        <Form form={typeForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label="字典名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="字典标识" rules={[{ required: true, message: '请输入标识' }]}>
            <Input disabled={!!editingType} />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}>
            <Input placeholder="1=正常 0=禁用" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Dict Data Drawer/Modal */}
      {dataModalOpen && (
        <Card title={`字典数据 - ${currentTypeCode}`} className="mb-4">
          <div className="mb-4">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateData}>新增字典项</Button>
          </div>
          <Table
            rowKey="id" columns={dataColumns} dataSource={dictData} loading={dataLoading}
            pagination={false}
          />

          {/* Data Edit Modal */}
          <Modal
            title={editingData ? '编辑字典项' : '新增字典项'}
            open={dataEditModalOpen}
            onOk={handleDataOk}
            onCancel={() => setDataEditModalOpen(false)}
            confirmLoading={dataModalLoading}
            destroyOnClose
          >
            <Form form={dataForm} layout="vertical" preserve={false}>
              <Form.Item name="typeCode" label="字典类型">
                <Input disabled />
              </Form.Item>
              <Form.Item name="label" label="标签" rules={[{ required: true, message: '请输入标签' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="value" label="值" rules={[{ required: true, message: '请输入值' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="sort" label="排序" initialValue={0}>
                <Input type="number" />
              </Form.Item>
              <Form.Item name="cssClass" label="样式">
                <Input placeholder="Tag 颜色样式" />
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
        </Card>
      )}
    </div>
  )
}

export default DictPage
