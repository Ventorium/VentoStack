import { useState } from 'react'
import { Tabs, Card } from 'antd'
import LoginLogPage from './login-content'
import OperationLogPage from './operation-content'

const LogsPage = () => {
  const [activeKey, setActiveKey] = useState('login')

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">系统日志</h3>
      <Card>
        <Tabs
          type="card"
          activeKey={activeKey}
          onChange={setActiveKey}
          destroyInactiveTabPane
          items={[
            { key: 'login', label: '登录日志', children: <LoginLogPage /> },
            { key: 'operation', label: '操作日志', children: <OperationLogPage /> },
          ]}
        />
      </Card>
    </div>
  )
}

export default LogsPage
