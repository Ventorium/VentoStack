import { useAuth } from '@/store/useAuth'
import { useMenu } from '@/store/useMenu'
import { useNavigate } from 'react-router'
import { Layout, Space, Dropdown, Avatar, theme } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons'

const { Header: AntHeader } = Layout

const Header = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const collapsed = useMenu(s => s.collapsed)
  const toggleCollapsed = useMenu(s => s.toggleCollapsed)
  const { token } = theme.useToken()

  const onLogout = () => {
    logout()
    navigate('/auth/login', { replace: true })
  }

  const dropdownItems = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: '个人信息' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') onLogout()
      if (key === 'profile') navigate('/app/profile')
    },
  }

  return (
    <AntHeader
      className="flex items-center justify-between px-6"
      style={{
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        height: 48,
        lineHeight: '48px',
      }}
    >
      <div
        className="text-lg cursor-pointer"
        onClick={toggleCollapsed}
      >
        {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      </div>

      <Dropdown menu={dropdownItems} placement="bottomRight">
        <Space className="cursor-pointer hover:opacity-80">
          <Avatar size={32} icon={<UserOutlined />} />
          <span>{user?.nickname ?? user?.username ?? '用户'}</span>
        </Space>
      </Dropdown>
    </AntHeader>
  )
}

export default Header
