---
name: admin-crud-page
description: 创建前端标准 CRUD 管理页面。当需要新增一个系统管理实体的前端页面（搜索 + 表格 + 弹窗表单）时调用。涵盖完整页面模板、fetcher 定义、useTable 接入、columns 定义、Modal 表单模式。
---

# Admin CRUD Page — 前端标准页面创建指南

## When To Use

- 新增一个系统管理页面（如 Product、Category、Tag）
- 页面模式为：搜索栏 + 分页表格 + 新增/编辑弹窗

不适用于：树形管理页、只读日志页、Dashboard、详情页。

## 完整模板

以下模板可直接 copy-paste，替换 `Xxx` / `xxx` / 中文标题即可使用：

```tsx
import { useState } from 'react'
import { Card, Table, Button, Input, Form, Modal, Space, Tag, message, Row, Col } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { client } from '@/api'
import type { PaginatedData } from '@/hooks/useTable'
import { useTable } from '@/hooks/useTable'
import ActionColumn from '@/components/ActionColumn'
import DictSelect from '@/components/DictSelect'

const XxxPage = () => {
  const { loading, data, total, page, pageSize, refresh, onSearch, onReset, onPageChange,
          selectedRowKeys, rowSelection, clearSelection, hasSelected } = useTable<XxxItem>(fetcher)
  const [searchForm] = Form.useForm()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<XxxItem | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [form] = Form.useForm()

  // 搜索
  const handleSearch = () => { onSearch(cleanParams(searchForm.getFieldsValue())) }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  // CRUD
  const openCreate = () => { setEditingItem(null); form.resetFields(); setModalOpen(true) }
  const openEdit = (r: XxxItem) => { setEditingItem(r); form.setFieldsValue({ ...r }); setModalOpen(true) }
  const handleOk = async () => {
    const values = await form.validateFields()
    setModalLoading(true)
    try {
      if (editingItem) {
        const { error } = await client.put('/api/system/xxx/:id', { params: { id: editingItem.id }, body: values })
        if (!error) { message.success('更新成功'); setModalOpen(false); refresh() }
      } else {
        const { error } = await client.post('/api/system/xxx', { body: values })
        if (!error) { message.success('创建成功'); setModalOpen(false); refresh() }
      }
    } finally { setModalLoading(false) }
  }
  const handleDelete = async (id: string) => {
    const { error } = await client.delete('/api/system/xxx/:id', { params: { id } })
    if (!error) { message.success('删除成功'); refresh() }
  }

  // 列定义
  const columns: ColumnsType<XxxItem> = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (_: unknown, r: XxxItem) => <Tag color={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? '正常' : '禁用'}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180,
      render: (_: unknown, r: XxxItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 130, fixed: 'right' as const,
      render: (_: unknown, r: XxxItem) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => openEdit(r) },
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">页面标题</h3>
      {/* 搜索栏 */}
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="name"><Input placeholder="名称" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="status">
            <DictSelect typeCode="sys_status" placeholder="状态" allowClear style={{ width: 100 }} />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          </Space>
        </Form>
      </Card>
      {/* 表格 */}
      <Card title={`列表（${total}）`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增</Button>}>
        {hasSelected && (
          <div className="mb-2 text-sm text-gray-500">
            已选 {selectedRowKeys.length} 项
            <Button type="link" size="small" onClick={clearSelection}>取消选择</Button>
          </div>
        )}
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small"
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 900 }} rowSelection={rowSelection} />
      </Card>
      {/* 弹窗表单 */}
      <Modal title={editingItem ? '编辑' : '新增'} open={modalOpen} onOk={handleOk}
        onCancel={() => setModalOpen(false)} confirmLoading={modalLoading} destroyOnHidden width={640}>
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <DictSelect typeCode="sys_status" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default XxxPage
```

## Checklist

1. **类型**：从 OpenAPI 生成的类型导入（不要手写）
2. **文件位置**：`src/pages/app/<module>/<entity>/index.tsx`（文件路由自动生效）
3. **搜索字段**：根据业务调整搜索项（Input / DictSelect / DatePicker 等）
4. **列定义**：根据业务字段调整，时间列 `width: 180`，操作列 `width: 130~160` `fixed: 'right'`
5. **表单字段**：根据业务调整，两列布局用 `Row gutter={16}` + `Col span={12}`
6. **验证**：确保 `scroll={{ x }}` 不小于所有列宽之和

## 前后端契约约束（2026-09 模块审查）

配置页因契约不一致被 strict 校验拒绝（前端搜索传 `name`/`key`，后端 listQuery 只允许 `group`）、字典页因 `dictType`/`typeCode` 字段名不一致导致落库 undefined。新增或修改页面时必须逐条核对：

- **搜索字段 ↔ listQuery 一一对应**：页面搜索栏出现的每个字段，后端 `listQuery` Schema 必须声明同名、同类型字段（int/string 对齐），service 用 ORM 参数化实现筛选。strict 校验下未声明字段直接 400。
- **表单字段 ↔ createBody/updateBody 对齐**：前端实际提交的每个字段（含 `group`、`sort` 等），后端 Schema 必须声明；后端可更新的字段前端表单应有对应入口。
- **类型三端一致**：同一字段在前端、后端 Schema、数据库中的类型必须一致（配置 `type` 前端数字、Schema 字符串、数据库数字的教训）。
- **禁止 as 断言桥接**：前端字段名与后端/service 参数名不一致时，要么统一命名，要么在路由显式映射；不允许 `as` 强转后运行时为 undefined。
- **主键策略**：编辑/删除路径参数传 UUID `id`；按 code 操作必须走显式 `/by-code/:code` 端点，不要把 code 塞进 `:id`。
- **个人数据走自助端点**：个人中心类页面（登录日志、通知、资料）请求 `/api/system/user/**`，不请求管理端点；不传 userId。
- **敏感值展示**：后端脱敏返回的配置值（如 `******`），前端编辑时空值提交表示"不修改"，禁止把掩码原样回传。

## API 调用模式速查

| 操作 | 调用方式 |
|------|----------|
| 列表 | `client.get('/api/xxx', { query: cleanParams(params) })` |
| 详情 | `client.get('/api/xxx/:id', { params: { id } })` |
| 创建 | `client.post('/api/xxx', { body: values })` |
| 更新 | `client.put('/api/xxx/:id', { params: { id }, body: values })` |
| 删除 | `client.delete('/api/xxx/:id', { params: { id } })` |
