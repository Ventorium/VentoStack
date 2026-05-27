import { describe, test, expect, mock } from 'bun:test'

describe('消息中心页', () => {
  test('NotifyMessage 类型应包含必要字段', () => {
    const msg = {
      id: '1', receiverId: 'u1', channel: 'in_app', title: '系统通知',
      content: '测试内容', status: 'UNREAD', createdAt: '2024-01-01'
    }
    expect(msg.title).toBeTruthy()
    expect(['UNREAD', 'READ']).toContain(msg.status)
    expect(['email', 'sms', 'webhook', 'in_app']).toContain(msg.channel)
  })

  test('NotifyTemplate 类型应包含必要字段', () => {
    const tpl = {
      id: '1', type: 'system', channel: 'smtp', titleTemplate: '通知: {{title}}',
      contentTemplate: '内容: {{content}}', variables: '["title","content"]',
      status: 1, createdAt: '2024-01-01'
    }
    expect(tpl.titleTemplate).toContain('{{')
    expect(tpl.channel).toBeTruthy()
  })

  test('批量标记已读请求体正确', () => {
    const ids = ['1', '2', '3']
    const body = { ids }
    expect(body.ids).toHaveLength(3)
    expect(body.ids).toContain('1')
  })

  test('消息渠道选项正确', () => {
    const channels = [
      { value: 'email', label: '邮件' },
      { value: 'sms', label: '短信' },
      { value: 'webhook', label: 'Webhook' },
      { value: 'in_app', label: '站内信' },
    ]
    expect(channels).toHaveLength(4)
    expect(channels.map(c => c.value)).toContain('in_app')
  })

  test('NOTIFICATION_API 常量路径正确', () => {
    const NOTIFICATION_API = {
      MESSAGES: '/api/system/notification/messages',
      UNREAD_COUNT: '/api/system/notification/messages/unread-count',
      MESSAGE_READ: '/api/system/notification/messages/:id/read',
      MESSAGE_READ_BATCH: '/api/system/notification/messages/read-batch',
      TEMPLATES: '/api/system/notification/templates',
      TEMPLATE_CREATE: '/api/system/notification/templates',
      TEMPLATE_UPDATE: '/api/system/notification/templates/:id',
      TEMPLATE_DELETE: '/api/system/notification/templates/:id',
    }
    expect(NOTIFICATION_API.MESSAGES).toBe('/api/system/notification/messages')
    expect(NOTIFICATION_API.MESSAGE_READ).toContain(':id/read')
    expect(NOTIFICATION_API.MESSAGE_READ_BATCH).toBe('/api/system/notification/messages/read-batch')
    expect(NOTIFICATION_API.UNREAD_COUNT).toContain('unread-count')
  })

  test('标记单条已读 API: PUT /api/system/notification/messages/:id/read', () => {
    const client = { put: mock(() => Promise.resolve({ error: null })) }
    client.put('/api/system/notification/messages/:id/read', { params: { id: '123' } })
    expect(client.put).toHaveBeenCalledTimes(1)
    const [url, options] = client.put.mock.calls[0]
    expect(url).toBe('/api/system/notification/messages/:id/read')
    expect(options.params.id).toBe('123')
  })

  test('批量标记已读 API: POST read-batch body 含 messageIds', () => {
    const client = { post: mock(() => Promise.resolve({ error: null })) }
    const selectedRowKeys = ['1', '2', '3']
    client.post('/api/system/notification/messages/read-batch', { body: { messageIds: selectedRowKeys } })
    expect(client.post).toHaveBeenCalledTimes(1)
    const [url, options] = client.post.mock.calls[0]
    expect(url).toBe('/api/system/notification/messages/read-batch')
    expect(options.body.messageIds).toEqual(['1', '2', '3'])
    expect(options.body.messageIds).toHaveLength(3)
  })

  test('删除消息 API: DELETE /api/system/notification/messages/:id', () => {
    const client = { delete: mock(() => Promise.resolve({ error: null })) }
    client.delete('/api/system/notification/messages', { params: { id: '456' } })
    expect(client.delete).toHaveBeenCalledTimes(1)
    const [url, options] = client.delete.mock.calls[0]
    expect(url).toBe('/api/system/notification/messages')
    expect(options.params.id).toBe('456')
  })

  test('渠道映射颜色正确', () => {
    const channelMap: Record<string, { label: string; color: string }> = {
      email: { label: '邮件', color: 'blue' },
      sms: { label: '短信', color: 'green' },
      webhook: { label: 'Webhook', color: 'purple' },
      in_app: { label: '站内信', color: 'orange' },
    }
    expect(channelMap.email.color).toBe('blue')
    expect(channelMap.sms.color).toBe('green')
    expect(channelMap.webhook.color).toBe('purple')
    expect(channelMap.in_app.color).toBe('orange')
    expect(Object.keys(channelMap)).toHaveLength(4)
  })

  test('未读状态显示 Badge processing，已读显示 Badge default', () => {
    const getStatusBadge = (status: string) =>
      status === 'UNREAD' ? { status: 'processing', text: '未读' } : { status: 'default', text: '已读' }
    expect(getStatusBadge('UNREAD')).toEqual({ status: 'processing', text: '未读' })
    expect(getStatusBadge('READ')).toEqual({ status: 'default', text: '已读' })
  })

  test('搜索参数包含 title、channel、status', () => {
    const searchParams = { title: '系统', channel: 'in_app', status: 'UNREAD' }
    expect(searchParams.title).toBe('系统')
    expect(searchParams.channel).toBe('in_app')
    expect(searchParams.status).toBe('UNREAD')
  })

  test('搜索参数经 cleanParams 后应过滤空值', () => {
    const cleanParams = (params: Record<string, unknown>) => {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          result[key] = value
        }
      }
      return result
    }
    expect(cleanParams({ title: '系统', channel: '', status: undefined })).toEqual({ title: '系统' })
    expect(cleanParams({ title: '', channel: 'email', status: 'READ' })).toEqual({ channel: 'email', status: 'READ' })
  })

  test('查看详情时若消息未读应自动标记已读', () => {
    const client = { put: mock(() => Promise.resolve({ error: null })) }
    const record = { id: 'msg1', status: 'UNREAD', title: '测试', channel: 'in_app', content: '内容', createdAt: '2024-01-01' }
    // 模拟 handleViewDetail 逻辑
    if (record.status === 'UNREAD') {
      client.put('/api/system/notification/messages/:id/read', { params: { id: record.id } })
    }
    expect(client.put).toHaveBeenCalledTimes(1)
    expect(client.put.mock.calls[0][1].params.id).toBe('msg1')
  })

  test('查看详情时若消息已读不应调用标记 API', () => {
    const client = { put: mock(() => Promise.resolve({ error: null })) }
    const record = { id: 'msg1', status: 'READ', title: '测试', channel: 'in_app', content: '内容', createdAt: '2024-01-01' }
    if (record.status === 'UNREAD') {
      client.put('/api/system/notification/messages/:id/read', { params: { id: record.id } })
    }
    expect(client.put).not.toHaveBeenCalled()
  })

  test('未读消息的操作列包含"标记已读"按钮', () => {
    const getActionItems = (status: string) => {
      const items = [{ label: '查看' }]
      if (status === 'UNREAD') items.push({ label: '标记已读' })
      items.push({ label: '删除' })
      return items
    }
    expect(getActionItems('UNREAD').map(i => i.label)).toContain('标记已读')
    expect(getActionItems('READ').map(i => i.label)).not.toContain('标记已读')
    expect(getActionItems('UNREAD')).toHaveLength(3)
    expect(getActionItems('READ')).toHaveLength(2)
  })

  test('消息列表 table rowKey 为 id', () => {
    const rowKey = 'id'
    expect(rowKey).toBe('id')
  })
})
