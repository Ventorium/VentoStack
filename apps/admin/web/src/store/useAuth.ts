import { create } from 'zustand'
import { startAuthentication } from '@simplewebauthn/browser'
import { client, setOnUnauthorized } from '@/api'
import { globalNavigate } from '@/components/GlobalHistory'
import { getAccessToken, setAccessToken, clearToken } from './token'

interface UserProfile {
  id: string; username: string; nickname: string; email: string; phone: string
  avatar: string; gender: number; status: number; deptId: string; deptName: string
  roles: string[]; permissions: string[]
}

export type LoginForm = { username: string; password: string }

export type PasswordExpiredInfo = { code: 'password_expired'; tempToken: string }

export type MfaRequiredInfo = { code: 'mfa_required'; mfaToken: string }

export type LoginResult = UserProfile | PasswordExpiredInfo | MfaRequiredInfo | null

export type AuthState = {
  user: UserProfile | null
  ready: boolean
  loading: boolean
  computed: { logged: boolean }
  init: () => Promise<void>
  refreshProfile: () => Promise<void>
  login: (args: LoginForm) => Promise<LoginResult>
  completeMFALogin: (mfaToken: string, code: string) => Promise<LoginResult>
  passkeyLogin: (username: string) => Promise<LoginResult>
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
  async refreshProfile() {
    const { data: user } = await client.get('/api/system/user/profile') as { data?: UserProfile; error?: unknown }
    if (user) set({ user })
  },
  async init() {
    if (get().loading) return
    set({ loading: true })
    const accessToken = getAccessToken()
    if (accessToken) {
      const { data: user, error } = await client.get('/api/system/user/profile') as { data?: UserProfile; error?: unknown }
      if (!error && user) {
        set({ user })
      } else {
        clearToken()
      }
    }
    set({ loading: false, ready: true })
  },
  async login(args) {
    const { error, data } = await client.post('/api/auth/login', { body: args })
    if (!error && data) {
      // MFA required — return mfaToken for second step
      if (data.mfaRequired && data.mfaToken) {
        return { code: 'mfa_required' as const, mfaToken: data.mfaToken }
      }
      // Normal login success
      setAccessToken(data.accessToken)
      const { data: user } = await client.get('/api/system/user/profile') as { data?: UserProfile; error?: unknown }
      if (user) {
        const result: UserProfile & { mfaSetupRequired?: boolean } = { ...user }
        if (data.mfaSetupRequired) {
          result.mfaSetupRequired = true
        }
        set({ user })
        return result
      }
    }
    // 密码过期：返回临时 token 信息
    if (error?.code === 'password_expired' && error.tempToken) {
      return { code: 'password_expired' as const, tempToken: error.tempToken }
    }
    return null
  },
  async completeMFALogin(mfaToken, code) {
    const { error, data } = await client.post('/api/auth/mfa/login', { body: { mfaToken, code } }) as { data?: { accessToken: string; refreshToken: string; expiresIn: number; sessionId: string }; error?: unknown }
    if (!error && data) {
      setAccessToken(data.accessToken)
      const { data: user } = await client.get('/api/system/user/profile') as { data?: UserProfile; error?: unknown }
      if (user) {
        set({ user })
        return user
      }
    }
    return null
  },
  async passkeyLogin(username) {
    try {
      const { error: beginError, data: beginData } = await client.post('/api/auth/passkey/login-begin', { body: { username } } as any) as { data?: { challengeId: string; options: unknown }; error?: unknown }
      if (beginError || !beginData) return null

      const assertion = await startAuthentication({ optionsJSON: beginData.options as any })
      const { error: finishError, data: finishData } = await client.post('/api/auth/passkey/login-finish', {
        body: { challengeId: beginData.challengeId, assertion },
      } as any) as { data?: { accessToken: string; refreshToken: string; expiresIn: number; sessionId: string }; error?: unknown }

      if (finishError || !finishData) return null

      setAccessToken(finishData.accessToken)
      const { data: user } = await client.get('/api/system/user/profile') as { data?: UserProfile; error?: unknown }
      if (user) {
        set({ user })
        return user
      }
    } catch {
      // NotAllowedError: user cancelled browser dialog
    }
    return null
  },
  logout() {
    client.post('/api/auth/logout')
    set({ user: null })
    onExpired()
  },
}))

// 注册 401 全局处理 — API 返回 401 时自动跳转登录页
setOnUnauthorized(() => {
  useAuth.setState({ user: null })
  globalNavigate('/auth/login', { replace: true })
})
