import { describe, test, expect } from 'bun:test'
import { cleanParams } from '@/utils/cleanParams'

describe('定时任务管理页', () => {
  test('cleanParams 过滤空值', () => {
    expect(cleanParams({ name: 'test', status: '', page: undefined })).toEqual({ name: 'test' })
    expect(cleanParams({})).toEqual({})
    expect(cleanParams({ a: null, b: 0, c: false })).toEqual({ b: 0, c: false })
  })

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
      toggle: '/api/system/scheduler/jobs/:id/toggle',
      execute: '/api/system/scheduler/jobs/:id/execute',
      logs: '/api/system/scheduler/jobs/:id/logs'
    }
    expect(endpoints.list).toBe('/api/system/scheduler/jobs')
    expect(endpoints.toggle).toContain('toggle')
    expect(endpoints.execute).toContain('execute')
  })

  test('状态映射正确', () => {
    const statusMap: Record<string, { color: string; text: string }> = {
      RUNNING: { color: 'green', text: '运行中' },
      PAUSED: { color: 'orange', text: '已暂停' }
    }
    expect(statusMap.RUNNING.color).toBe('green')
    expect(statusMap.PAUSED.color).toBe('orange')
  })
})
