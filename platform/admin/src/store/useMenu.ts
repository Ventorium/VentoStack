import { create } from 'zustand'
import { menuApi } from '@/api/system'
import type { FrontendRoute } from '@/api/types'

export interface MenuState {
  routes: FrontendRoute[]
  permissions: string[]
  ready: boolean
  collapsed: boolean

  fetchRoutes: () => Promise<void>
  toggleCollapsed: () => void
  hasPermission: (perm: string) => boolean
}

export const useMenu = create<MenuState>((set, get) => ({
  routes: [],
  permissions: [],
  ready: false,
  collapsed: false,

  async fetchRoutes() {
    const { data: routes, error: routesErr } = await menuApi.getRoutes()
    const { data: permissions, error: permsErr } = await menuApi.getPermissions()
    if (!routesErr) {
      set({ routes: routes ?? [] })
    }
    if (!permsErr) {
      set({ permissions: permissions ?? [] })
    }
    set({ ready: true })
  },

  toggleCollapsed() {
    set(s => ({ collapsed: !s.collapsed }))
  },

  hasPermission(perm: string) {
    const { permissions } = get()
    if (permissions.includes('*') || permissions.includes('admin')) return true
    return permissions.includes(perm)
  },
}))

export function usePermission() {
  return useMenu(s => ({
    permissions: s.permissions,
    hasPermission: s.hasPermission,
  }))
}
