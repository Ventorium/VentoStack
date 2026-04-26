import { useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { Menu } from 'antd'
import {
  SettingOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  MenuOutlined,
  ApartmentOutlined,
  ProfileOutlined,
  BookOutlined,
  BellOutlined,
  FileTextOutlined,
  DashboardOutlined,
  type AntDesignOutlined,
} from '@ant-design/icons'
import { useMenu } from '@/store/useMenu'

const iconMap: Record<string, typeof AntDesignOutlined> = {
  setting: SettingOutlined,
  team: TeamOutlined,
  safety: SafetyCertificateOutlined,
  menu: MenuOutlined,
  apartment: ApartmentOutlined,
  profile: ProfileOutlined,
  book: BookOutlined,
  bell: BellOutlined,
  fileText: FileTextOutlined,
  dashboard: DashboardOutlined,
}

function resolveIcon(icon?: string) {
  if (!icon) return null
  const Icon = iconMap[icon]
  if (Icon) return <Icon />
  // try rendering as a custom icon string
  return null
}

function convertRoutesToMenuItems(routes: import('@/api/types').FrontendRoute[]): any[] {
  return routes
    .filter(r => !r.meta?.hidden)
    .map(r => {
      const item: any = {
        key: r.path,
        label: r.meta?.title ?? r.name,
        icon: resolveIcon(r.meta?.icon),
      }
      if (r.children?.length) {
        item.children = convertRoutesToMenuItems(r.children)
      }
      return item
    })
}

const SideMenu = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const routes = useMenu(s => s.routes)
  const collapsed = useMenu(s => s.collapsed)

  const menuItems = useMemo(() => convertRoutesToMenuItems(routes), [routes])

  // compute selected keys from current path
  const selectedKeys = useMemo(() => {
    return [location.pathname]
  }, [location.pathname])

  // compute open keys for submenus
  const defaultOpenKeys = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean)
    const keys: string[] = []
    for (let i = 1; i < segments.length; i++) {
      keys.push('/' + segments.slice(0, i + 1).join('/'))
    }
    return keys
  }, [])

  const onClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="h-14 flex items-center justify-center text-white font-semibold text-base shrink-0 border-b border-white/10">
        {collapsed ? 'VS' : 'VentoStack'}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={selectedKeys}
          defaultOpenKeys={defaultOpenKeys}
          items={menuItems}
          onClick={onClick}
          inlineCollapsed={collapsed}
        />
      </div>
    </div>
  )
}

export default SideMenu
