import { useState } from 'react'
import { Card, Table, Button, Input, InputNumber, Form, Modal, Drawer, Space, Tag, Row, Col } from 'antd'
import { msg } from '@/components/GlobalMessage'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { PaginatedData, DictTypeItem, DictDataItem } from '@/api/types'
import { useTable, cleanParams, fmtDate } from '@ventostack/gui'
import ActionColumn from '@/components/ActionColumn'
import DictSelect from '@/components/DictSelect'

const typeFetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/dict/types', { query: cleanParams(params) }) as Promise<{ error?: unknown; data?: PaginatedData<DictTypeItem> }>

const DictPage = () => {
  const { loading: typeLoading, data: typeData, total, page, pageSize, refresh, onSearch, onReset, onPageChange, selectedRowKeys, rowSelection, clearSelection, hasSelected } =
    useTable<DictTypeItem>(typeFetcher)
  const [searchForm] = Form.useForm()
  const [typeModalOpen, setTypeModalOpen] = useState(false)
  const [editingType, setEditingType] = useState<DictTypeItem | null>(null)
  const [typeModalLoading, setTypeModalLoading] = useState(false)
  const [typeForm] = Form.useForm()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [currentTypeCode, setCurrentTypeCode] = useState('')
  const [currentTypeName, setCurrentTypeName] = useState('')
  const [dictData, setDictData] = useState<DictDataItem[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataEditOpen, setDataEditOpen] = useState(false)
  const [editingData, setEditingData] = useState<DictDataItem | null>(null)
  const [dataModalLoading, setDataModalLoading] = useState(false)
  const [dataForm] = Form.useForm()

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    onSearch(cleanParams(values))
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  const openCreateType = () => { setEditingType(null); typeForm.resetFields(); setTypeModalOpen(true) }
  const openEditType = (r: DictTypeItem) => { setEditingType(r); typeForm.setFieldsValue({ name: r.name, code: r.code, remark: r.remark, status: r.status }); setTypeModalOpen(true) }

  const handleTypeOk = async () => {
    const values = await typeForm.validateFields()
    setTypeModalLoading(true)
    try {
      if (editingType) {
        const { error } = await client.put('/api/system/dict/types/:id', { params: { id: editingType.code }, body: values })
        if (!error) { msg.success('更新成功'); setTypeModalOpen(false); refresh() }
      } else {
        const { error } = await client.post('/api/system/dict/types', { body: values })
        if (!error) { msg.success('创建成功'); setTypeModalOpen(false); refresh() }
      }
    } finally { setTypeModalLoading(false) }
  }
  const handleDeleteType = async (code: string) => {
    const { error } = await client.delete('/api/system/dict/types/:id', { params: { id: code } })
    if (!error) { msg.success('删除成功'); refresh() }
  }

  const openDictData = async (typeCode: string, typeName: string) => {
    setCurrentTypeCode(typeCode); setCurrentTypeName(typeName); setDataLoading(true); setDrawerOpen(true)
    const { error, data } = await client.get('/api/system/dict/types/:code/data', { params: { code: typeCode } }) as { error?: unknown; data?: DictDataItem[] }
    if (!error) { setDictData(data ?? []) }
    setDataLoading(false)
  }

  const openCreateData = () => { setEditingData(null); dataForm.resetFields(); dataForm.setFieldsValue({ sort: 0, status: 1 }); setDataEditOpen(true) }
  const openEditData = (r: DictDataItem) => { setEditingData(r); dataForm.setFieldsValue({ label: r.label, value: r.value, sort: r.sort, cssClass: r.cssClass, status: r.status, remark: r.remark }); setDataEditOpen(true) }

  const handleDataOk = async () => {
    const values = await dataForm.validateFields()
    setDataModalLoading(true)
    try {
      if (editingData) {
        const { error } = await client.put('/api/system/dict/data/:id', { params: { id: editingData.id }, body: values })
        if (!error) { msg.success('更新成功'); setDataEditOpen(false); openDictData(currentTypeCode, currentTypeName) }
      } else {
        const { error } = await client.post('/api/system/dict/data', { body: { ...values, typeCode: currentTypeCode } })
        if (!error) { msg.success('创建成功'); setDataEditOpen(false); openDictData(currentTypeCode, currentTypeName) }
      }
    } finally { setDataModalLoading(false) }
  }

  const handleDeleteData = async (id: string) => {
    const { error } = await client.delete('/api/system/dict/data/:id', { params: { id } })
    if (!error) { msg.success('删除成功'); openDictData(currentTypeCode, currentTypeName) }
  }

  const typeColumns: ColumnsType<DictTypeItem> = [
    { title: '字典名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '字典标识', dataIndex: 'code', key: 'code', width: 160 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (_: unknown, r: DictTypeItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: DictTypeItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, r: DictTypeItem) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEditType(r) },
          { label: '字典数据', onClick: () => openDictData(r.code, r.name) },
          { label: '删除', onClick: () => handleDeleteType(r.code), danger: true, confirm: '确定删除该字典类型？' },
        ]} />
      ) },
  ]
  const dataColumns: ColumnsType<DictDataItem> = [
    { title: '标签', dataIndex: 'label', key: 'label', width: 140 }, { title: '值', dataIndex: 'value', key: 'value', width: 140 },
    { title: '样式', dataIndex: 'cssClass', key: 'cssClass', width: 100 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (_: unknown, r: DictDataItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 60 },
    { title: '操作', key: 'action', width: 130, fixed: 'right' as const,
      render: (_: unknown, r: DictDataItem) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEditData(r) },
          { label: '删除', onClick: () => handleDeleteData(r.id), danger: true, confirm: '确定删除？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">字典管理</h3>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name"><Input placeholder="字典名称" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="code"><Input placeholder="字典标识" /></Form.Item>
          <Space><Button type="primary" onClick={handleSearch}>搜索</Button><Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button></Space>
        </Form>
      </Card>
      <Card title={`字典类型（${total}）`} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreateType}>新增字典</Button>}>
        {hasSelected && <div className="mb-2 text-sm text-gray-500">已选 {selectedRowKeys.length} 项 <Button type="link" size="small" onClick={clearSelection}>取消选择</Button></div>}
        <Table rowKey="id" columns={typeColumns} dataSource={typeData} loading={typeLoading} size="small"
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1000 }} rowSelection={rowSelection} />
      </Card>
      <Modal title={editingType ? '编辑字典类型' : '新增字典类型'} open={typeModalOpen} onOk={handleTypeOk} onCancel={() => setTypeModalOpen(false)} confirmLoading={typeModalLoading} destroyOnHidden width={640}>
        <Form form={typeForm} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="字典名称" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="code" label="字典标识" rules={[{ required: true }]}><Input disabled={!!editingType} /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <DictSelect typeCode="sys_status" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Drawer title={`字典数据 - ${currentTypeName || currentTypeCode}`} open={drawerOpen} onClose={() => setDrawerOpen(false)} size="large" destroyOnHidden>
        <div className="mb-4"><Button type="primary" icon={<PlusOutlined />} onClick={openCreateData}>新增字典项</Button></div>
        <Table rowKey="id" columns={dataColumns} dataSource={dictData} loading={dataLoading} pagination={false} scroll={{ x: 600 }} size="small" />
      </Drawer>

      <Modal title={editingData ? '编辑字典项' : '新增字典项'} open={dataEditOpen} onOk={handleDataOk} onCancel={() => setDataEditOpen(false)} confirmLoading={dataModalLoading} destroyOnHidden width={640}>
        <Form form={dataForm} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="label" label="字典标签" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="value" label="字典值" rules={[{ required: true }]}><Input /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="sort" label="排序" initialValue={0}><InputNumber className="w-full" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="cssClass" label="样式"><Input placeholder="Tag 颜色" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <DictSelect typeCode="sys_status" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DictPage
