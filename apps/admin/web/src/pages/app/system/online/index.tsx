import { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Modal } from 'antd'
import { msg } from '@/components/GlobalMessage'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, LogoutOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { OnlineUser } from '@/api/types'
import { fmtDate } from '@/utils/fmtDate'

const OnlinePage = () => {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<OnlineUser[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const { error, data } = await client.get('/api/system/monitor/online')
      if (!error && data) setData(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleForceLogout = async (sessionId: string) => {
    const { error } = await client.delete('/api/system/monitor/online/:sessionId', { params: { sessionId } })
    if (!error) {
      msg.success('已强制下线')
      fetchData()
    }
  }

  const columns: ColumnsType<OnlineUser> = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '昵称', dataIndex: 'nickname', key: 'nickname', width: 120 },
    { title: 'IP地址', dataIndex: 'ip', key: 'ip', width: 140 },
    { title: '浏览器', dataIndex: 'browser', key: 'browser', width: 120 },
    { title: '操作系统', dataIndex: 'os', key: 'os', width: 120 },
    { title: '登录时间', dataIndex: 'loginAt', key: 'loginAt', width: 180, render: (_: unknown, r: OnlineUser) => fmtDate(r.loginAt) },
    { title: '最后访问', dataIndex: 'lastAccessAt', key: 'lastAccessAt', width: 180, render: (_: unknown, r: OnlineUser) => fmtDate(r.lastAccessAt) },
    { title: '操作', key: 'action', width: 100, fixed: 'right' as const,
      render: (_: unknown, r: OnlineUser) => (
        <Button
          type="link"
          size="small"
          danger
          icon={<LogoutOutlined />}
          onClick={() => Modal.confirm({
            title: '强制下线',
            content: `确定要强制下线用户 ${r.nickname} 吗？`,
            onOk: () => handleForceLogout(r.sessionId),
          })}
        >
          强制下线
        </Button>
      ) },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">在线用户</h3>
        <Space>
          <Button loading={loading} icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type={autoRefresh ? 'primary' : 'default'} onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? '自动刷新：开' : '自动刷新：关'}
          </Button>
        </Space>
      </div>
      <Card title={`在线用户（${data.length}）`}>
        <Table rowKey="sessionId" columns={columns} dataSource={data} loading={loading} size="small" pagination={false} scroll={{ x: 1200 }} />
      </Card>
    </div>
  )
}

export default OnlinePage
