import { useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { Menu } from 'antd'
import { useMenu } from '@/store/useMenu'
import { resolveIcon } from '@/utils/icon'

/** 将后端路由路径补全为前端完整路径（/app 前缀） */
function normalizePath(path: string): string {
  if (path.startsWith('/app')) return path
  return `/app${path.startsWith('/') ? '' : '/'}${path}`
}

function convertRoutesToMenuItems(routes: import('@/api/types').FrontendRoute[]): any[] {
  return routes
    .filter(r => !r.meta?.hidden)
    .map(r => {
      const item: any = {
        key: normalizePath(r.path),
        label: r.meta?.title ?? r.name,
        icon: (() => { const Icon = resolveIcon(r.meta?.icon); return Icon ? <Icon /> : null })(),
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
