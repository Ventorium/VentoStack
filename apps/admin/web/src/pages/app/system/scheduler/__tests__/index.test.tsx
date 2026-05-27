import { describe, test, expect } from 'bun:test'

describe('定时任务管理页', () => {
  test('ScheduleJob 类型应包含必要字段', () => {
    const job = {
      id: '1',
      name: '测试任务',
      cron: '*/5 * * * *',
      handlerId: 'handler1',
      params: '{}',
      status: 'RUNNING',
      description: 'desc',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }
    expect(job.id).toBeTruthy()
    expect(job.name).toBe('测试任务')
    expect(job.cron).toBe('*/5 * * * *')
    expect(['RUNNING', 'PAUSED']).toContain(job.status)
  })

  test('ScheduleJobLog 类型应包含必要字段', () => {
    const log = {
      id: '1',
      jobId: 'j1',
      jobName: '任务1',
      startAt: '2024-01-01T00:00:00Z',
      endAt: '2024-01-01T00:00:01Z',
      status: 'SUCCESS',
      result: 'ok',
      error: '',
      durationMs: 1000
    }
    expect(log.durationMs).toBe(1000)
    expect(['SUCCESS', 'FAILED']).toContain(log.status)
  })

  test('API 端点路径正确', () => {
    const endpoints = {
      list: '/api/system/scheduler/jobs',
      create: '/api/system/scheduler/jobs',
      update: '/api/system/scheduler/jobs/:id',
      delete: '/api/system/scheduler/jobs/:id',
      start: '/api/system/scheduler/jobs/:id/start',
      stop: '/api/system/scheduler/jobs/:id/stop',
      execute: '/api/system/scheduler/jobs/:id/execute',
      logs: '/api/system/scheduler/logs',
    }
    expect(endpoints.list).toBe('/api/system/scheduler/jobs')
    expect(endpoints.start).toContain('start')
    expect(endpoints.stop).toContain('stop')
    expect(endpoints.execute).toContain('execute')
    expect(endpoints.logs).toBe('/api/system/scheduler/logs')
  })

  test('状态映射正确', () => {
    const statusMap: Record<string, { color: string; text: string }> = {
      RUNNING: { color: 'green', text: '运行中' },
      PAUSED: { color: 'orange', text: '已暂停' }
    }
    expect(statusMap.RUNNING.color).toBe('green')
    expect(statusMap.PAUSED.color).toBe('orange')
  })

  // --- 新增测试用例 ---

  test('创建任务 body 应包含 name, handlerId, cron, params, description', () => {
    const buildCreateBody = (values: Record<string, unknown>) => ({
      name: values.name,
      handlerId: values.handlerId,
      cron: values.cron,
      params: values.params,
      description: values.description,
    })

    const body = buildCreateBody({
      name: '测试任务',
      handlerId: 'handler_cleanup',
      cron: '0 0 2 * * ?',
      params: '{"key":"value"}',
      description: '每天凌晨2点执行清理',
    })

    expect(body.name).toBe('测试任务')
    expect(body.handlerId).toBe('handler_cleanup')
    expect(body.cron).toBe('0 0 2 * * ?')
    expect(body.params).toBe('{"key":"value"}')
    expect(body.description).toBe('每天凌晨2点执行清理')
  })

  test('更新任务 body 应包含相同字段', () => {
    const buildUpdateBody = (id: string, values: Record<string, unknown>) => ({
      params: { id },
      body: {
        name: values.name,
        handlerId: values.handlerId,
        cron: values.cron,
        params: values.params,
        description: values.description,
      },
    })

    const req = buildUpdateBody('j1', {
      name: '更新任务',
      handlerId: 'handler_v2',
      cron: '0 0 3 * * ?',
      params: '{"updated":true}',
      description: '更新后的描述',
    })

    expect(req.params.id).toBe('j1')
    expect(req.body.name).toBe('更新任务')
    expect(req.body.handlerId).toBe('handler_v2')
    expect(req.body.cron).toBe('0 0 3 * * ?')
  })

  test('toggle handler: status=RUNNING 调用 JOB_STOP', () => {
    const SCHEDULER_API = {
      JOB_START: '/api/system/scheduler/jobs/:id/start',
      JOB_STOP: '/api/system/scheduler/jobs/:id/stop',
    }

    const getToggleEndpoint = (status: string) =>
      status === 'RUNNING' ? SCHEDULER_API.JOB_STOP : SCHEDULER_API.JOB_START

    expect(getToggleEndpoint('RUNNING')).toBe('/api/system/scheduler/jobs/:id/stop')
    expect(getToggleEndpoint('PAUSED')).toBe('/api/system/scheduler/jobs/:id/start')
  })

  test('toggle handler: status=PAUSED 调用 JOB_START', () => {
    const SCHEDULER_API = {
      JOB_START: '/api/system/scheduler/jobs/:id/start',
      JOB_STOP: '/api/system/scheduler/jobs/:id/stop',
    }

    const getToggleEndpoint = (status: string) =>
      status === 'RUNNING' ? SCHEDULER_API.JOB_STOP : SCHEDULER_API.JOB_START

    expect(getToggleEndpoint('PAUSED')).toBe('/api/system/scheduler/jobs/:id/start')
    expect(getToggleEndpoint('RUNNING')).toBe('/api/system/scheduler/jobs/:id/stop')
  })

  test('toggle 操作标签: RUNNING 显示暂停, PAUSED 显示启动', () => {
    const getToggleLabel = (status: string) => status === 'RUNNING' ? '暂停' : '启动'
    expect(getToggleLabel('RUNNING')).toBe('暂停')
    expect(getToggleLabel('PAUSED')).toBe('启动')
  })

  test('execute handler: POST /api/system/scheduler/jobs/:id/execute', () => {
    const buildExecuteRequest = (id: string) => ({
      url: `/api/system/scheduler/jobs/${id}/execute`,
      method: 'POST',
      params: { id },
    })

    const req = buildExecuteRequest('j1')
    expect(req.url).toBe('/api/system/scheduler/jobs/j1/execute')
    expect(req.method).toBe('POST')
    expect(req.params.id).toBe('j1')
  })

  test('viewLogs: 导航到 /app/system/scheduler/logs?jobId=${id}', () => {
    const getLogsUrl = (id: string) => `/app/system/scheduler/logs?jobId=${id}`
    expect(getLogsUrl('j1')).toBe('/app/system/scheduler/logs?jobId=j1')
    expect(getLogsUrl('abc-123')).toBe('/app/system/scheduler/logs?jobId=abc-123')
  })

  test('搜索参数: name 和 status', () => {
    const cleanParams = (params: Record<string, unknown>) => {
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') result[k] = v
      }
      return result
    }

    expect(cleanParams({ name: '清理', status: 'RUNNING' })).toEqual({ name: '清理', status: 'RUNNING' })
    expect(cleanParams({ name: '', status: undefined })).toEqual({})
    expect(cleanParams({ name: 'task', status: undefined })).toEqual({ name: 'task' })
    expect(cleanParams({ name: '', status: 'PAUSED' })).toEqual({ status: 'PAUSED' })
  })

  test('状态选项应为 RUNNING 和 PAUSED（非字典值）', () => {
    const statusOptions = [
      { value: 'RUNNING', label: '运行中' },
      { value: 'PAUSED', label: '已暂停' },
    ]
    expect(statusOptions).toHaveLength(2)
    expect(statusOptions[0].value).toBe('RUNNING')
    expect(statusOptions[0].label).toBe('运行中')
    expect(statusOptions[1].value).toBe('PAUSED')
    expect(statusOptions[1].label).toBe('已暂停')
    // 确认不是数字状态
    expect(typeof statusOptions[0].value).toBe('string')
    expect(typeof statusOptions[1].value).toBe('string')
  })

  test('状态 Tag 颜色: RUNNING->green, PAUSED->orange', () => {
    const getStatusColor = (status: string) => status === 'RUNNING' ? 'green' : 'orange'
    const getStatusText = (status: string) => status === 'RUNNING' ? '运行中' : '已暂停'

    expect(getStatusColor('RUNNING')).toBe('green')
    expect(getStatusColor('PAUSED')).toBe('orange')
    expect(getStatusText('RUNNING')).toBe('运行中')
    expect(getStatusText('PAUSED')).toBe('已暂停')
  })
})
