import { createFetchClient } from '@doremijs/o2t/client'
import { msg } from '@/components/GlobalMessage'
import { getAccessToken, clearToken } from '@/store/token'
import type { OpenAPIs } from './schema'

let onUnauthorized: (() => void) | null = null

export function setOnUnauthorized(fn: () => void) {
  onUnauthorized = fn
}

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
    // 401 — Token 过期或无效，清除并跳转登录
    if (response.status === 401) {
      clearToken()
      onUnauthorized?.()
      return new Response(JSON.stringify({ code: 401, message: '未授权', data: null }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // 解包后端 { code, message, data } 信封
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json') && response.ok) {
      const json = await response.json()
      if (json && typeof json === 'object' && 'code' in json) {
        if (json.code !== 0) {
          msg.error(json.message || '请求失败')
          return new Response(JSON.stringify({ code: json.code, message: json.message, data: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
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
      msg.error(error.message)
    } else if (response) {
      try {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          const resp = await response.clone().json()
          msg.error(resp?.message || '服务器错误')
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
