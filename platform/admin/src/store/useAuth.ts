import { create } from 'zustand'
import { authApi } from '@/api/system'
import type { UserProfile } from '@/api/types'
import { globalNavigate } from '@/components/GlobalHistory'
import { getAccessToken, setAccessToken, clearToken } from './token'

export type LoginForm = { username: string; password: string }

export type AuthState = {
  user: UserProfile | null
  ready: boolean
  loading: boolean
  computed: {
    logged: boolean
  }
  init: () => Promise<void>
  login: (args: LoginForm) => Promise<UserProfile | null>
  logout: () => void
}

function onExpired() {
  clearToken()
  globalNavigate('/auth/login', { replace: true })
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  ready: false,
  loading: false,
  computed: {
    get logged() {
      return !!get().user
    },
  },
  async init() {
    if (get().loading) return
    set({ loading: true })
    const accessToken = getAccessToken()
    if (accessToken) {
      const { data: user, error } = await authApi.getProfile()
      if (!error && user) {
        set({ user })
      } else {
        // token expired or invalid
        clearToken()
      }
    }
    set({ loading: false, ready: true })
  },
  async login(args) {
    const { error, data } = await authApi.login(args)
    if (!error && data) {
      setAccessToken(data.accessToken)
      const { data: user } = await authApi.getProfile()
      if (user) {
        set({ user })
        return user
      }
    }
    return null
  },
  logout() {
    authApi.logout()
    set({ user: null })
    onExpired()
  },
}))
