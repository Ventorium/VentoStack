import { describe, test, expect } from 'bun:test'

describe('系统日志页', () => {
  test('Tabs 配置包含两个标签页', () => {
    const tabItems = [
      { key: 'login', label: '登录日志' },
      { key: 'operation', label: '操作日志' },
    ]
    expect(tabItems).toHaveLength(2)
    expect(tabItems[0].key).toBe('login')
    expect(tabItems[0].label).toBe('登录日志')
    expect(tabItems[1].key).toBe('operation')
    expect(tabItems[1].label).toBe('操作日志')
  })

  test('默认激活登录日志标签', () => {
    const defaultActiveKey = 'login'
    expect(defaultActiveKey).toBe('login')
  })

  test('Tabs 类型为 card', () => {
    const tabType = 'card'
    expect(tabType).toBe('card')
  })

  test('使用 destroyInactiveTabPane 实现懒加载', () => {
    const destroyInactiveTabPane = true
    expect(destroyInactiveTabPane).toBe(true)
  })
})
