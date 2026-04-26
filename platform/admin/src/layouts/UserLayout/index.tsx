import { useEffect, type ReactNode } from 'react'
import { Layout } from 'antd'
import SideMenu from './components/SideMenu'
import Header from './components/Header'
import { useMenu } from '@/store/useMenu'

const { Sider, Content } = Layout

interface UserLayoutProps {
  children: ReactNode
}

const UserLayout = ({ children }: UserLayoutProps) => {
  const collapsed = useMenu(s => s.collapsed)
  const fetchRoutes = useMenu(s => s.fetchRoutes)
  const menuReady = useMenu(s => s.ready)

  useEffect(() => {
    if (!menuReady) {
      fetchRoutes()
    }
  }, [menuReady, fetchRoutes])

  return (
    <Layout className="h-screen w-screen overflow-hidden">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={220}
        collapsedWidth={64}
        className="overflow-hidden"
        style={{
          background: '#001529',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <SideMenu />
      </Sider>
      <Layout>
        <Header />
        <Content
          className="overflow-auto p-6"
          style={{ background: '#f5f5f5' }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default UserLayout
