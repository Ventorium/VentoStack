import { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Spin } from 'antd'
import { TeamOutlined, SafetyCertificateOutlined, FileTextOutlined, BellOutlined } from '@ant-design/icons'
import { client } from '@/api'

interface DashboardStats {
  userCount: number
  roleCount: number
  todayLogs: number
  unreadNotices: number
}

const DashboardPage = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/api/system/dashboard/stats').then((res) => {
      const data = (res as { data?: DashboardStats }).data
      if (data) setStats(data)
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800">仪表盘</h2>
        <p className="text-gray-500 mt-1">欢迎回到 VentoStack 管理后台</p>
      </div>

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable>
              <Statistic
                title="用户总数"
                value={stats?.userCount ?? 0}
                prefix={<TeamOutlined className="text-blue-500" />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable>
              <Statistic
                title="角色数量"
                value={stats?.roleCount ?? 0}
                prefix={<SafetyCertificateOutlined className="text-green-500" />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable>
              <Statistic
                title="今日日志"
                value={stats?.todayLogs ?? 0}
                prefix={<FileTextOutlined className="text-orange-500" />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable>
              <Statistic
                title="未读公告"
                value={stats?.unreadNotices ?? 0}
                prefix={<BellOutlined className="text-purple-500" />}
              />
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  )
}

export default DashboardPage
