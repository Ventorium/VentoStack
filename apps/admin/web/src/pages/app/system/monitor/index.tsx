import { useState, useEffect } from 'react'
import { Card, Row, Col, Progress, Tag, Button, Space, Statistic, Spin } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { client } from '@/api'
import type { ServerStatus, CacheStatus, DataSourceStatus, HealthStatus } from '@/api/types'

const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${days}天 ${hours}小时 ${minutes}分钟`
}

const MonitorPage = () => {
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [loading, setLoading] = useState(false)

  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null)
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null)
  const [dataSourceStatus, setDataSourceStatus] = useState<DataSourceStatus | null>(null)
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)

  const fetchAllData = async () => {
    setLoading(true)
    const [serverRes, cacheRes, dsRes, healthRes] = await Promise.all([
      client.get('/api/system/monitor/server'),
      client.get('/api/system/monitor/cache'),
      client.get('/api/system/monitor/datasource'),
      client.get('/api/system/monitor/health'),
    ])
    if (!serverRes?.error && serverRes?.data) setServerStatus(serverRes.data)
    if (!cacheRes?.error && cacheRes?.data) setCacheStatus(cacheRes.data)
    if (!dsRes?.error && dsRes?.data) setDataSourceStatus(dsRes.data)
    if (!healthRes?.error && healthRes?.data) setHealthStatus(healthRes.data)
    setLoading(false)
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchAllData, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">系统监控</h3>
        <Space>
          <Button loading={loading} icon={<ReloadOutlined />} onClick={fetchAllData}>刷新</Button>
          <Button type={autoRefresh ? 'primary' : 'default'} onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? '自动刷新：开' : '自动刷新：关'}
          </Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Row gutter={16} className="mb-4">
          <Col span={6}>
            <Card title="服务器状态" size="small">
              {serverStatus ? (
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">CPU使用率</div>
                    <Progress percent={Math.round(serverStatus.cpuUsage * 100)} size="small" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">内存使用率</div>
                    <Progress percent={Math.round(serverStatus.memoryUsage * 100)} size="small" />
                    <div className="text-xs text-gray-400 mt-1">
                      {Math.round(serverStatus.memoryUsed / 1024 / 1024)} MB / {Math.round(serverStatus.memoryTotal / 1024 / 1024)} MB
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">运行时间</div>
                    <div className="text-base font-medium">{formatUptime(serverStatus.uptime)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">运行时版本</div>
                    <div className="text-xs text-gray-600">Bun: {serverStatus.bunVersion}</div>
                    <div className="text-xs text-gray-600">Node: {serverStatus.nodeVersion}</div>
                  </div>
                </Space>
              ) : (
                <div className="text-center text-gray-400 py-4">暂无数据</div>
              )}
            </Card>
          </Col>

          <Col span={6}>
            <Card title="缓存状态" size="small">
              {cacheStatus ? (
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <Statistic title="键数量" value={cacheStatus.keyCount} />
                  <div>
                    <div className="text-sm text-gray-500 mb-1">命中率</div>
                    <Progress percent={Math.round(cacheStatus.hitRate * 100)} size="small" />
                  </div>
                  <Statistic title="内存使用" value={Math.round(cacheStatus.memoryUsage / 1024 / 1024)} suffix="MB" />
                </Space>
              ) : (
                <div className="text-center text-gray-400 py-4">暂无数据</div>
              )}
            </Card>
          </Col>

          <Col span={6}>
            <Card title="数据源状态" size="small">
              {dataSourceStatus ? (
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">连接状态</div>
                    <Tag color={dataSourceStatus.status === 'UP' ? 'green' : 'red'}>{dataSourceStatus.status}</Tag>
                  </div>
                  <Statistic title="活跃连接" value={dataSourceStatus.activeConnections} />
                  <Statistic title="空闲连接" value={dataSourceStatus.idleConnections} />
                  <Statistic title="最大连接数" value={dataSourceStatus.maxConnections} />
                </Space>
              ) : (
                <div className="text-center text-gray-400 py-4">暂无数据</div>
              )}
            </Card>
          </Col>

          <Col span={6}>
            <Card title="健康检查" size="small">
              {healthStatus ? (
                <Space orientation="vertical" style={{ width: '100%' }}>
                  <div>
                    <div className="text-sm text-gray-500 mb-1">总体状态</div>
                    <Tag color={healthStatus.status === 'UP' ? 'green' : 'red'}>{healthStatus.status}</Tag>
                  </div>
                  <div className="mt-2">
                    <div className="text-sm text-gray-500 mb-2">检查项</div>
                    {healthStatus.checks.map((check) => (
                      <div key={check.name} className="flex justify-between items-center py-1">
                        <span className="text-xs">{check.name}</span>
                        <Tag color={check.status === 'UP' ? 'green' : 'red'} style={{ fontSize: 10 }}>
                          {check.status}
                        </Tag>
                      </div>
                    ))}
                  </div>
                </Space>
              ) : (
                <div className="text-center text-gray-400 py-4">暂无数据</div>
              )}
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}

export default MonitorPage
