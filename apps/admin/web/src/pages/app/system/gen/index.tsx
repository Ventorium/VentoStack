import { useState } from 'react'
import { Card, Table, Button, Modal, Space, Tag, Tabs } from 'antd'
import { msg } from '@/components/GlobalMessage'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { client } from '@/api'
import type { GenTable, DbTable } from '@/api/types'
import { useTable } from '@/hooks/useTable'
import { cleanParams } from '@/utils/cleanParams'
import { fmtDate } from '@/utils/fmtDate'
import ActionColumn from '@/components/ActionColumn'

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/gen/tables', { query: cleanParams(params) })

const GenPage = () => {
  const navigate = useNavigate()
  const { loading, data, total, page, pageSize, refresh, onPageChange } = useTable<GenTable>(fetcher)

  const [dbTables, setDbTables] = useState<DbTable[]>([])
  const [dbTablesLoading, setDbTablesLoading] = useState(false)
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewData, setPreviewData] = useState<Array<{ name: string; content: string }>>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const fetchDbTables = async () => {
    setDbTablesLoading(true)
    try {
      const { error, data: result } = await client.get('/api/system/gen/db-tables')
      if (!error) {
        setDbTables(result ?? [])
      }
    } finally {
      setDbTablesLoading(false)
    }
  }

  const handleImport = async (tableName: string) => {
    const { error } = await client.post('/api/system/gen/import', { body: { tableName } })
    if (!error) {
      msg.success('导入成功')
      refresh()
    }
  }

  const handlePreview = async (id: string) => {
    setPreviewLoading(true)
    setPreviewModalOpen(true)
    try {
      const { error, data: result } = await client.get('/api/system/gen/tables/:id/preview', { params: { id } })
      if (!error) {
        setPreviewData(result?.files ?? [])
      }
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleGenerate = async (id: string) => {
    const { error } = await client.post('/api/system/gen/tables/:id/generate', { params: { id } })
    if (!error) {
      msg.success('代码生成成功')
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await client.delete('/api/system/gen/tables/:id', { params: { id } })
    if (!error) {
      msg.success('删除成功')
      refresh()
    }
  }

  const dbTableColumns: ColumnsType<DbTable> = [
    { title: '表名', dataIndex: 'tableName', key: 'tableName', width: 200 },
    { title: '表描述', dataIndex: 'tableComment', key: 'tableComment', ellipsis: true },
    { title: '引擎', dataIndex: 'engine', key: 'engine', width: 80 },
    { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 180, render: (_: unknown, r: DbTable) => fmtDate(r.createTime) },
    { title: '操作', key: 'action', width: 100, fixed: 'right' as const,
      render: (_: unknown, r: DbTable) => (
        <Button type="link" size="small" onClick={() => handleImport(r.tableName)}>导入</Button>
      ) },
  ]

  const genTypeMap: Record<string, { label: string; color: string }> = {
    single: { label: '单表', color: 'blue' },
    tree: { label: '树表', color: 'green' },
    sub: { label: '主子表', color: 'purple' },
  }

  const columns: ColumnsType<GenTable> = [
    { title: '表名称', dataIndex: 'tableName', key: 'tableName', width: 180 },
    { title: '模块名称', dataIndex: 'moduleName', key: 'moduleName', width: 120 },
    { title: '生成类型', dataIndex: 'genType', key: 'genType', width: 100,
      render: (_: unknown, r: GenTable) => {
        const t = genTypeMap[r.genType]
        return <Tag color={t?.color}>{t?.label ?? r.genType}</Tag>
      } },
    { title: '包路径', dataIndex: 'packagePath', key: 'packagePath', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: GenTable) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 180, fixed: 'right' as const,
      render: (_: unknown, r: GenTable) => (
        <ActionColumn items={[
          { label: '编辑', onClick: () => navigate(`/app/system/gen/edit/${r.id}`) },
          { label: '预览', onClick: () => handlePreview(r.id) },
          { label: '生成代码', onClick: () => handleGenerate(r.id) },
          { label: '删除', onClick: () => handleDelete(r.id), danger: true, confirm: '确定删除该配置？' },
        ]} />
      ) },
  ]

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">代码生成</h3>
      <Tabs
        defaultActiveKey="configured"
        items={[
          {
            key: 'db',
            label: '数据库表',
            children: (
              <Card title={`可用表（${dbTables.length}）`} extra={<Button icon={<ReloadOutlined />} onClick={fetchDbTables}>刷新</Button>}>
                <Table
                  rowKey="tableName"
                  columns={dbTableColumns}
                  dataSource={dbTables}
                  loading={dbTablesLoading}
                  size="small"
                  pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
                  scroll={{ x: 800 }}
                />
              </Card>
            ),
          },
          {
            key: 'configured',
            label: '生成配置',
            children: (
              <Card title={`已配置表（${total}）`} extra={<Space><Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button></Space>}>
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={data}
                  loading={loading}
                  size="small"
                  pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
                  scroll={{ x: 1000 }}
                />
              </Card>
            ),
          },
        ]}
      />
      <Modal title="代码预览" open={previewModalOpen} onCancel={() => setPreviewModalOpen(false)} footer={null} width={900} destroyOnClose>
        {previewLoading ? (
          <div className="text-center py-8">加载中...</div>
        ) : (
          <Tabs
            items={previewData.map((file, idx) => ({
              key: String(idx),
              label: file.name,
              children: (
                <div className="bg-gray-50 p-4 rounded max-h-96 overflow-auto">
                  <pre className="text-xs whitespace-pre-wrap">{file.content}</pre>
                </div>
              ),
            }))}
          />
        )}
      </Modal>
    </div>
  )
}

export default GenPage
