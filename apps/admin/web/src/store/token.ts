import { STORAGE_KEYS } from '@/constants'

export function getAccessToken(): string | null {
  // 优先从 URL 参数中获取 token
  const urlParams = new URLSearchParams(window.location.search)
  const urlToken = urlParams.get('token')
  if (urlToken) {
    setAccessToken(urlToken)
    // 清除 URL 中的 token 参数
    urlParams.delete('token')
    const newUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '')
    window.history.replaceState({}, '', newUrl)
    return urlToken
  }
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
}

export function setAccessToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, token)
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
}
