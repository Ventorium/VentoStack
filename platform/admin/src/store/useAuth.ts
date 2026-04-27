import { create } from 'zustand'
import { client } from '@/api'
import { globalNavigate } from '@/components/GlobalHistory'
import { getAccessToken, setAccessToken, clearToken } from './token'

interface UserProfile {
  id: string; username: string; nickname: string; email: string; phone: string
  avatar: string; gender: number; status: number; deptId: string; deptName: string
  roles: string[]; permissions: string[]
}

export type LoginForm = { username: string; password: string }

export type AuthState = {
  user: UserProfile | null
  ready: boolean
  loading: boolean
  computed: { logged: boolean }
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
    get logged() { return !!get().user },
  },
  async init() {
    if (get().loading) return
    set({ loading: true })
    const accessToken = getAccessToken()
    if (accessToken) {
      const { data: user, error } = await client.get<UserProfile>('/api/system/user/profile')
      if (!error && user) {
        set({ user })
      } else {
        clearToken()
      }
    }
    set({ loading: false, ready: true })
  },
  async login(args) {
    const { error, data } = await client.post<{ accessToken: string; refreshToken: string; expiresIn: number; sessionId: string; mfaRequired: boolean }>('/api/auth/login', { body: args })
    if (!error && data) {
      setAccessToken(data.accessToken)
      const { data: user } = await client.get<UserProfile>('/api/system/user/profile')
      if (user) {
        set({ user })
        return user
      }
    }
    return null
  },
  logout() {
    client.post('/api/auth/logout')
    set({ user: null })
    onExpired()
  },
}))
