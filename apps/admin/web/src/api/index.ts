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
  async responseInterceptor(_request, response) {
    // 401 — Token 过期或无效
    if (response.status === 401) {
      clearToken()
      globalNavigate('/auth/login', { replace: true })
      return new Response(null, { status: 401 })
    }

    // 403 — 密码过期特殊处理，通过 ok Response 透传 error 信息
    if (response.status === 403) {
      const ct = response.headers.get('content-type')
      if (ct?.includes('application/json')) {
        const json: any = await response.clone().json()
        if (json?.data?.code === 'password_expired') {
          return new Response(JSON.stringify({
            error: { code: 'password_expired', tempToken: json.data.tempToken },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
      }
      return response
    }

    // 解包后端 { code, message, data } 信封
    const ct = response.headers.get('content-type')
    if (response.ok && ct?.includes('application/json')) {
      const json: any = await response.clone().json()
      if (json && typeof json === 'object' && 'code' in json) {
        if (json.code !== 0) {
          msg.error(json.message || '请求失败')
          return new Response(null, { status: 400 })
        }
        // code=0 成功，解包 data 层
        return new Response(JSON.stringify(json.data ?? null), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    return response
  },
  async errorHandler(request, response, error) {
    if (error) {
      const msgMap: Record<string, string> = {
        'Failed to fetch': '网络连接失败，请检查网络',
        'The user aborted a request': '请求已取消',
        'NetworkError': '网络连接失败，请检查网络',
        'TimeoutError': '请求超时，请稍后重试',
      }
      const key = Object.keys(msgMap).find(k => error.message.includes(k))
      msg.error(key ? msgMap[key] : '请求失败，请稍后重试')
    } else if (response) {
      try {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          const resp: any = await response.clone().json()
          msg.error(resp?.message || resp?.msg || '服务器错误')
        } else {
          msg.error(await response.text() || '服务器错误')
        }
      } catch {
        msg.error('服务器错误')
      }
    }
    console.error(request, response, error)
  }
})
