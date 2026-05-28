import { Card, Table, Input, Select, Form, Button, Tag, Space, Modal, Descriptions } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { PaginatedData, OperationLogItem } from '@/api/types'
import { useTable } from '@/hooks/useTable'
import { cleanParams } from '@/utils/cleanParams'
import { fmtDate } from '@/utils/fmtDate'
import ActionColumn from '@/components/ActionColumn'
import { useState } from 'react'

const fetcher = (params: Record<string, unknown>) =>
  client.get('/api/system/operation-logs', { query: cleanParams(params) }) as Promise<{ error?: unknown; data?: PaginatedData<OperationLogItem> }>

const resultMap: Record<number, { label: string; color: string }> = {
  0: { label: '失败', color: 'red' },
  1: { label: '成功', color: 'green' },
}

const OperationLogPage = () => {
  const { loading, data, total, page, pageSize, onSearch, onReset, onPageChange } =
    useTable<OperationLogItem>(fetcher)
  const [searchForm] = Form.useForm()
  const [detailRecord, setDetailRecord] = useState<OperationLogItem | null>(null)

  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    onSearch(cleanParams(values))
  }
  const handleReset = () => { searchForm.resetFields(); onReset() }

  /** 解析 params 字段，跳过文件类型参数 */
  const parseParams = (raw: string | null | undefined): Record<string, unknown> | null => {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        // 过滤掉文件类型参数（值包含 file/File 对象特征）
        const filtered: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (v instanceof File || (typeof v === 'object' && v !== null && (v as Record<string, unknown>).type === 'file')) continue
          filtered[k] = v
        }
        return filtered
      }
      return { value: parsed }
    } catch {
      return raw ? { raw } : null
    }
  }

  const columns: ColumnsType<OperationLogItem> = [
    { title: '用户', dataIndex: 'username', key: 'username', width: 100 },
    { title: '模块', dataIndex: 'module', key: 'module', width: 100 },
    { title: '操作', dataIndex: 'action', key: 'action', width: 100 },
    { title: '请求方式', dataIndex: 'method', key: 'method', width: 80 },
    { title: '请求地址', dataIndex: 'url', key: 'url', ellipsis: true,
      render: (_: unknown, r: OperationLogItem) => <span className="font-mono text-sm">{r.method} {r.url}</span> },
    { title: 'IP', dataIndex: 'ip', key: 'ip', width: 120 },
    { title: '结果', dataIndex: 'result', key: 'result', width: 80,
      render: (_: unknown, r: OperationLogItem) => { const s = resultMap[r.result]; return <Tag color={s?.color}>{s?.label ?? r.result}</Tag> } },
    { title: '耗时(ms)', dataIndex: 'duration', key: 'duration', width: 80 },
    { title: '操作时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: (_: unknown, r: OperationLogItem) => fmtDate(r.createdAt) },
    { title: '操作', key: 'action', width: 80, fixed: 'right' as const,
      render: (_: unknown, r: OperationLogItem) => (
        <ActionColumn items={[
          { label: '详情', icon: <EyeOutlined />, onClick: () => setDetailRecord(r) },
        ]} maxInline={1} />
      ),
    },
  ]

  return (
    <div>
      <Card className="mb-4">
        <Form form={searchForm} layout="inline">
          <Form.Item name="username"><Input placeholder="用户名" prefix={<SearchOutlined />} /></Form.Item>
          <Form.Item name="module"><Input placeholder="模块" /></Form.Item>
          <Form.Item name="result">
            <Select placeholder="结果" allowClear style={{ width: 120 }}>
              <Select.Option value={1}>成功</Select.Option>
              <Select.Option value={0}>失败</Select.Option>
            </Select>
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSearch}>搜索</Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          </Space>
        </Form>
      </Card>
      <Card title={`操作日志（${total}）`}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: onPageChange }}
          scroll={{ x: 1200 }} size="small" />
      </Card>
      <Modal
        title="操作日志详情"
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        footer={null}
        width={640}
        destroyOnHidden
      >
        {detailRecord && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="用户">{detailRecord.username}</Descriptions.Item>
            <Descriptions.Item label="模块">{detailRecord.module}</Descriptions.Item>
            <Descriptions.Item label="操作">{detailRecord.action}</Descriptions.Item>
            <Descriptions.Item label="请求方式">{detailRecord.method}</Descriptions.Item>
            <Descriptions.Item label="请求地址"><span className="font-mono text-sm break-all">{detailRecord.url}</span></Descriptions.Item>
            <Descriptions.Item label="IP">{detailRecord.ip}</Descriptions.Item>
            <Descriptions.Item label="结果">
              {(() => { const s = resultMap[detailRecord.result]; return <Tag color={s?.color}>{s?.label ?? detailRecord.result}</Tag> })()}
            </Descriptions.Item>
            <Descriptions.Item label="耗时">{detailRecord.duration}ms</Descriptions.Item>
            <Descriptions.Item label="操作时间">{fmtDate(detailRecord.createdAt)}</Descriptions.Item>
            {detailRecord.errorMsg && <Descriptions.Item label="错误信息"><span className="text-red-500">{detailRecord.errorMsg}</span></Descriptions.Item>}
            {parseParams(detailRecord.params) && (
              <Descriptions.Item label="请求参数">
                <pre className="bg-gray-50 p-2 rounded text-sm max-h-64 overflow-auto whitespace-pre-wrap break-all m-0">
                  {JSON.stringify(parseParams(detailRecord.params), null, 2)}
                </pre>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default OperationLogPage
