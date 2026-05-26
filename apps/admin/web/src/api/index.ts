import { createFetchClient } from '@doremijs/o2t/client'
import { msg } from '@/components/GlobalMessage'
import { getAccessToken, clearToken } from '@/store/token'
import { globalNavigate } from '@/components/GlobalHistory'
import type { OpenAPIs } from './schema'

export const client = createFetchClient<OpenAPIs>({
  requestTimeoutMs: 10000,
  requestInterceptor(request) {
    const token = getAccessToken()
    if (!['/api/login'].includes(request.url) && token) {
      request.init.headers.Authorization = `Bearer ${token}`
    }
    return request
  },
  // async responseInterceptor(_request, response) {
  //   // 仅处理成功响应的信封解包 { code, message, data } → data
  //   if (!response.ok) return response

  //   const ct = response.headers.get('content-type')
  //   if (!ct?.includes('application/json')) return response

  //   const json: unknown = await response.clone().json()
  //   if (!json || typeof json !== 'object' || !('code' in json)) return response

  //   const envelope = json as { code: number; message?: string; data?: unknown }

  //   // code !== 0 业务错误，转为 400 由 errorHandler 统一处理
  //   if (envelope.code !== 0) {
  //     return new Response(
  //       JSON.stringify({ code: envelope.code, message: envelope.message || '请求失败' }),
  //       { status: 400, headers: { 'Content-Type': 'application/json' } },
  //     )
  //   }

  //   // code=0 成功，解包 data
  //   return new Response(JSON.stringify(envelope.data ?? null), {
  //     status: 200,
  //     headers: { 'Content-Type': 'application/json' },
  //   })
  // },
  async errorHandler(_request, response, error) {
    // 网络错误
    if (error) {
      const msgMap: Record<string, string> = {
        'Failed to fetch': '网络连接失败，请检查网络',
        'The user aborted a request': '请求已取消',
        'NetworkError': '网络连接失败，请检查网络',
        'TimeoutError': '请求超时，请稍后重试',
      }
      const key = Object.keys(msgMap).find(k => error.message.includes(k))
      msg.error(key ? msgMap[key] : '请求失败，请稍后重试')
      return
    }

    if (!response) return

    // 401 — 凭证无效：显示后端错误信息；有 token 时视为过期，清 token 并跳转登录
    if (response.status === 401) {
      try {
        const ct = response.headers.get('content-type')
        if (ct?.includes('application/json')) {
          const json: unknown = await response.clone().json()
          if (json && typeof json === 'object' && 'message' in json) {
            msg.error((json as { message: string }).message)
          }
        }
      } catch { /* ignore */ }
      if (getAccessToken()) {
        clearToken()
        globalNavigate('/auth/login', { replace: true })
      }
      return
    }

    // 400 — 业务错误（code !== 0 被转为 400）
    if (response.status === 400) {
      try {
        const json: unknown = await response.clone().json()
        if (json && typeof json === 'object' && 'message' in json) {
          msg.error((json as { message: string }).message)
        }
      } catch {
        msg.error('请求失败')
      }
      return
    }

    // 403 — 登录接口的密码过期由业务层处理，其他 403 显示错误信息
    if (response.status === 403) {
      try {
        const json: unknown = await response.clone().json()
        if (json && typeof json === 'object' && 'data' in json) {
          const data = (json as { data: unknown }).data
          if (data && typeof data === 'object' && 'code' in data && (data as { code: string }).code === 'password_expired') {
            return // 登录密码过期，由 useAuth.login() 处理
          }
        }
        if ('message' in (json as object)) {
          msg.error((json as { message: string }).message || '没有权限')
        }
      } catch {
        msg.error('没有权限')
      }
      return
    }

    // 其他服务端错误（500/502 等）
    try {
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const resp: unknown = await response.clone().json()
        if (resp && typeof resp === 'object' && 'message' in resp) {
          msg.error((resp as { message: string }).message || '服务器错误')
        } else {
          msg.error('服务器错误')
        }
      } else {
        const text = await response.text()
        msg.error(text || '服务器错误')
      }
    } catch {
      msg.error('服务器错误')
    }
  },
})
