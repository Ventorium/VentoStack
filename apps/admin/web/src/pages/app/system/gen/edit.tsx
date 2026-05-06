import { useState, useEffect } from 'react'
import { Card, Button, Form, Input, Select, Table, Space, Spin } from 'antd'
import { msg } from '@/components/GlobalMessage'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useParams } from 'react-router-dom'
import { client } from '@/api'
import type { GenTable, GenTableColumn } from '@/api/types'

const GenEditPage = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tableConfig, setTableConfig] = useState<GenTable | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true)
      try {
        const { error, data: result } = await client.get('/api/system/gen/tables/:id', { params: { id: id! } })
        if (!error && result) {
          setTableConfig(result)
          form.setFieldsValue({
            moduleName: result.moduleName,
            packagePath: result.packagePath,
            genType: result.genType,
            remark: result.remark,
          })
        }
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchConfig()
  }, [id, form])

  const handleSave = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const { error } = await client.put('/api/system/gen/tables/:id', {
        params: { id: id! },
        body: {
          moduleName: values.moduleName,
          packagePath: values.packagePath,
          genType: values.genType,
          remark: values.remark,
          columns: tableConfig?.columns,
        },
      })
      if (!error) {
        msg.success('保存成功')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleColumnUpdate = (key: string, field: keyof GenTableColumn, value: unknown) => {
    if (!tableConfig?.columns) return
    const updatedColumns = tableConfig.columns.map((col) =>
      col.id === key ? { ...col, [field]: value } : col
    )
    setTableConfig({ ...tableConfig, columns: updatedColumns })
  }

  const displayTypeOptions = [
    { label: '输入框', value: 'input' },
    { label: '文本域', value: 'textarea' },
    { label: '下拉框', value: 'select' },
    { label: '日期', value: 'date' },
    { label: '数字', value: 'number' },
  ]

  const queryTypeOptions = [
    { label: '等于', value: 'eq' },
    { label: '模糊', value: 'like' },
    { label: '范围', value: 'between' },
    { label: 'IN', value: 'in' },
  ]

  const genTypeOptions = [
    { label: '单表', value: 'single' },
    { label: '树表', value: 'tree' },
    { label: '主子表', value: 'sub' },
  ]

  const columnColumns: ColumnsType<GenTableColumn> = [
    { title: '字段名', dataIndex: 'columnName', key: 'columnName', width: 150 },
    { title: '字段类型', dataIndex: 'columnType', key: 'columnType', width: 120 },
    { title: 'TS类型', dataIndex: 'tsType', key: 'tsType', width: 100 },
    { title: '显示类型', key: 'displayType', width: 140,
      render: (_: unknown, r: GenTableColumn) => (
        <Select
          value={r.displayType}
          onChange={(v) => handleColumnUpdate(r.id, 'displayType', v)}
          options={displayTypeOptions}
          size="small"
          style={{ width: '100%' }}
        />
      ) },
    { title: '查询类型', key: 'queryType', width: 120,
      render: (_: unknown, r: GenTableColumn) => (
        <Select
          value={r.queryType}
          onChange={(v) => handleColumnUpdate(r.id, 'queryType', v)}
          options={queryTypeOptions}
          size="small"
          style={{ width: '100%' }}
          allowClear
        />
      ) },
    { title: '必填', key: 'required', width: 70,
      render: (_: unknown, r: GenTableColumn) => (
        <input
          type="checkbox"
          checked={r.required}
          onChange={(e) => handleColumnUpdate(r.id, 'required', e.target.checked)}
        />
      ) },
    { title: '列表', key: 'showInList', width: 70,
      render: (_: unknown, r: GenTableColumn) => (
        <input
          type="checkbox"
          checked={r.showInList}
          onChange={(e) => handleColumnUpdate(r.id, 'showInList', e.target.checked)}
        />
      ) },
    { title: '表单', key: 'showInForm', width: 70,
      render: (_: unknown, r: GenTableColumn) => (
        <input
          type="checkbox"
          checked={r.showInForm}
          onChange={(e) => handleColumnUpdate(r.id, 'showInForm', e.target.checked)}
        />
      ) },
    { title: '查询', key: 'showInQuery', width: 70,
      render: (_: unknown, r: GenTableColumn) => (
        <input
          type="checkbox"
          checked={r.showInQuery}
          onChange={(e) => handleColumnUpdate(r.id, 'showInQuery', e.target.checked)}
        />
      ) },
    { title: '备注', dataIndex: 'comment', key: 'comment', ellipsis: true },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">编辑代码生成配置</h3>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="基本信息">
          <Form form={form} layout="vertical">
            <Form.Item name="moduleName" label="模块名称" rules={[{ required: true, message: '请输入模块名称' }]}>
              <Input placeholder="如: system" />
            </Form.Item>
            <Form.Item name="packagePath" label="包路径" rules={[{ required: true, message: '请输入包路径' }]}>
              <Input placeholder="如: com.example.system" />
            </Form.Item>
            <Form.Item name="genType" label="生成类型" rules={[{ required: true, message: '请选择生成类型' }]}>
              <Select options={genTypeOptions} placeholder="选择生成类型" />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} placeholder="备注信息" />
            </Form.Item>
          </Form>
        </Card>

        <Card title="字段配置">
          <Table
            rowKey="id"
            columns={columnColumns}
            dataSource={tableConfig?.columns ?? []}
            size="small"
            pagination={false}
            scroll={{ x: 1000 }}
          />
        </Card>

        <Card>
          <Space>
            <Button type="primary" onClick={handleSave} loading={saving}>保存配置</Button>
            <Button onClick={() => navigate('/app/system/gen')}>返回</Button>
          </Space>
        </Card>
      </Space>
    </div>
  )
}

export default GenEditPage
