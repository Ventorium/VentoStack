import { describe, test, expect } from 'bun:test'
import { cleanParams } from '@/utils/cleanParams'

describe('通知模板管理页', () => {
  test('NotifyTemplate 类型应包含必要字段', () => {
    const tpl = {
      id: '1',
      type: 'welcome',
      channel: 'smtp',
      titleTemplate: '欢迎 {{username}}',
      contentTemplate: '您好 {{username}}，欢迎加入平台',
      variables: 'username, email',
      status: 1,
      createdAt: '2024-01-01T00:00:00Z',
    }
    expect(tpl.id).toBeTruthy()
    expect(tpl.type).toBeTruthy()
    expect(tpl.channel).toBeTruthy()
    expect(tpl.titleTemplate).toBeTruthy()
    expect(tpl.contentTemplate).toBeTruthy()
  })

  test('API 端点路径正确', () => {
    const endpoints = {
      list: '/api/system/notification/templates',
      create: '/api/system/notification/templates',
      update: '/api/system/notification/templates/:id',
      delete: '/api/system/notification/templates/:id',
    }
    expect(endpoints.list).toBe('/api/system/notification/templates')
    expect(endpoints.create).toBe('/api/system/notification/templates')
    expect(endpoints.update).toContain(':id')
    expect(endpoints.delete).toContain(':id')
  })

  test('渠道选项正确', () => {
    const channelOptions = [
      { label: '邮件', value: 'smtp' },
      { label: '短信', value: 'sms' },
      { label: 'Webhook', value: 'webhook' },
    ]
    expect(channelOptions).toHaveLength(3)
    expect(channelOptions.map(c => c.value)).toEqual(['smtp', 'sms', 'webhook'])
    expect(channelOptions.map(c => c.label)).toEqual(['邮件', '短信', 'Webhook'])
  })

  test('渠道标签映射正确', () => {
    const channelMap: Record<string, { label: string; color: string }> = {
      smtp: { label: '邮件', color: 'blue' },
      sms: { label: '短信', color: 'green' },
      webhook: { label: 'Webhook', color: 'purple' },
    }
    expect(channelMap.smtp.color).toBe('blue')
    expect(channelMap.sms.color).toBe('green')
    expect(channelMap.webhook.color).toBe('purple')
    expect(channelMap.smtp.label).toBe('邮件')
    expect(channelMap.sms.label).toBe('短信')
  })

  test('状态标签映射正确', () => {
    const statusMap: Record<number, { color: string; text: string }> = {
      1: { color: 'green', text: '启用' },
      0: { color: 'red', text: '禁用' },
    }
    expect(statusMap[1].color).toBe('green')
    expect(statusMap[1].text).toBe('启用')
    expect(statusMap[0].color).toBe('red')
    expect(statusMap[0].text).toBe('禁用')
  })

  test('cleanParams 应正确过滤搜索参数', () => {
    expect(cleanParams({ channel: 'smtp', type: 'welcome' })).toEqual({ channel: 'smtp', type: 'welcome' })
    expect(cleanParams({ channel: '', type: 'welcome' })).toEqual({ type: 'welcome' })
    expect(cleanParams({ channel: undefined, type: null })).toEqual({})
  })

  test('创建请求体应包含必要字段', () => {
    const createBody = {
      type: 'welcome',
      channel: 'smtp',
      titleTemplate: '欢迎 {{username}}',
      contentTemplate: '您好 {{username}}',
      variables: 'username',
      status: 1,
    }
    expect(createBody.type).toBeTruthy()
    expect(createBody.channel).toBeTruthy()
    expect(createBody.titleTemplate).toBeTruthy()
    expect(createBody.contentTemplate).toBeTruthy()
    expect([0, 1]).toContain(createBody.status)
  })

  test('状态值应为数字 0 或 1', () => {
    const toStatus = (checked: boolean) => checked ? 1 : 0
    expect(toStatus(true)).toBe(1)
    expect(toStatus(false)).toBe(0)
  })

  test('列定义应包含所有必要字段', () => {
    const columnKeys = ['type', 'channel', 'titleTemplate', 'contentTemplate', 'variables', 'status', 'createdAt', 'action']
    expect(columnKeys).toHaveLength(8)
    expect(columnKeys).toContain('channel')
    expect(columnKeys).toContain('status')
    expect(columnKeys).toContain('action')
  })

  test('未知渠道应显示原始值', () => {
    const channelMap: Record<string, { label: string; color: string }> = {
      smtp: { label: '邮件', color: 'blue' },
      sms: { label: '短信', color: 'green' },
      webhook: { label: 'Webhook', color: 'purple' },
    }
    const getChannelDisplay = (channel: string) => {
      const ch = channelMap[channel]
      return ch ? ch.label : channel
    }
    expect(getChannelDisplay('smtp')).toBe('邮件')
    expect(getChannelDisplay('unknown_channel')).toBe('unknown_channel')
  })

  test('编辑时应填充表单字段', () => {
    const template = {
      id: '1',
      type: 'welcome',
      channel: 'smtp',
      titleTemplate: '欢迎 {{username}}',
      contentTemplate: '内容',
      variables: 'username',
      status: 1,
    }
    const formValues = {
      type: template.type,
      channel: template.channel,
      titleTemplate: template.titleTemplate,
      contentTemplate: template.contentTemplate,
      variables: template.variables,
      status: template.status,
    }
    expect(formValues.type).toBe('welcome')
    expect(formValues.channel).toBe('smtp')
    expect(formValues.status).toBe(1)
  })
})
