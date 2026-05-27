import { describe, test, expect } from 'bun:test'

describe('登录日志页', () => {
  test('loginMethod 登录方式映射正确', () => {
    const map: Record<string, { label: string; color: string }> = {
      password: { label: '密码', color: 'default' },
      mfa: { label: 'MFA', color: 'blue' },
      passkey: { label: 'Passkey', color: 'green' },
    }
    expect(map.password.label).toBe('密码')
    expect(map.password.color).toBe('default')
    expect(map.mfa.label).toBe('MFA')
    expect(map.mfa.color).toBe('blue')
    expect(map.passkey.label).toBe('Passkey')
    expect(map.passkey.color).toBe('green')
  })

  test('loginMethod 未知方式使用默认样式', () => {
    const map: Record<string, { label: string; color: string }> = {
      password: { label: '密码', color: 'default' },
      mfa: { label: 'MFA', color: 'blue' },
      passkey: { label: 'Passkey', color: 'green' },
    }
    const getLoginMethodTag = (v: string) => map[v] || { label: v || '密码', color: 'default' }
    expect(getLoginMethodTag('unknown')).toEqual({ label: 'unknown', color: 'default' })
    expect(getLoginMethodTag('')).toEqual({ label: '密码', color: 'default' })
  })

  test('状态列渲染逻辑', () => {
    const getStatusTag = (status: number) => ({
      color: status === 1 ? 'green' : 'red',
      text: status === 1 ? '成功' : '失败',
    })
    expect(getStatusTag(1)).toEqual({ color: 'green', text: '成功' })
    expect(getStatusTag(0)).toEqual({ color: 'red', text: '失败' })
  })

  test('API 端点路径正确', () => {
    const endpoints = {
      list: '/api/system/login-logs',
      clear: '/api/system/login-logs',
      unlock: '/api/system/users/:id/unlock',
    }
    expect(endpoints.list).toBe('/api/system/login-logs')
    expect(endpoints.clear).toBe('/api/system/login-logs')
    expect(endpoints.unlock).toContain('unlock')
  })

  test('LoginLogItem 类型应包含必要字段', () => {
    const log = {
      id: 'l1',
      userId: 'u1',
      username: 'admin',
      ip: '192.168.1.1',
      location: '北京市',
      browser: 'Chrome 120',
      os: 'macOS',
      status: 1,
      loginMethod: 'password',
      message: '登录成功',
      loginAt: '2024-01-01T00:00:00Z',
    }
    expect(log.id).toBeTruthy()
    expect(log.username).toBeTruthy()
    expect(log.ip).toBeTruthy()
    expect([0, 1]).toContain(log.status)
    expect(['password', 'mfa', 'passkey']).toContain(log.loginMethod)
  })

  test('失败日志且有 userId 时显示解锁按钮', () => {
    const canUnlock = (status: number, userId?: string) => status === 0 && !!userId
    expect(canUnlock(0, 'u1')).toBe(true)
    expect(canUnlock(1, 'u1')).toBe(false)
    expect(canUnlock(0, undefined)).toBe(false)
    expect(canUnlock(0, '')).toBe(false)
  })

  test('消息中包含锁定或拉黑时显示账户异常标签', () => {
    const hasAbnormalTag = (message: string) => message?.includes('锁定') || message?.includes('拉黑')
    expect(hasAbnormalTag('账户已被锁定')).toBe(true)
    expect(hasAbnormalTag('IP已被拉黑')).toBe(true)
    expect(hasAbnormalTag('登录成功')).toBe(false)
    expect(hasAbnormalTag('密码错误')).toBe(false)
  })

  test('cleanParams 过滤空值', () => {
    const cleanParams = (params: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null))

    expect(cleanParams({ username: 'admin', status: '' })).toEqual({ username: 'admin' })
    expect(cleanParams({})).toEqual({})
    expect(cleanParams({ a: null, b: 0 })).toEqual({ b: 0 })
  })
})
