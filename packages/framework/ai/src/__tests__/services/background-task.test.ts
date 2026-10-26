import { describe, expect, test } from 'bun:test';
import { createBackgroundTaskService, mapBackgroundTask } from '../../services/background-task';
import { createMockDatabase } from '../helpers';

const scope = { tenantId: 't1', userId: 'u1' };

function taskRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'task-1',
    tenant_id: 't1',
    user_id: 'u1',
    agent_id: 'agent-1',
    session_id: 'session-1',
    title: '下载模型',
    kind: 'script',
    status: 'pending',
    command: 'curl -o model.bin https://example.com/model.bin',
    condition_command: null,
    prompt: null,
    schedule_kind: null,
    schedule_expr: null,
    resume_on_finish: true,
    notify_on_finish: true,
    max_runs: 100,
    run_count: 0,
    next_run_at: null,
    last_run_at: null,
    last_run_id: null,
    last_error: null,
    lease_owner: null,
    lease_expires_at: null,
    instance_id: null,
    sandbox_id: null,
    exec_pid: null,
    exec_log_path: null,
    exec_exit_path: null,
    created_at: new Date('2026-10-26T00:00:00Z'),
    updated_at: new Date('2026-10-26T00:00:00Z'),
    ...overrides,
  };
}

describe('mapBackgroundTask', () => {
  test('snake_case 行映射为 camelCase 实体，保留调度信息', () => {
    const task = mapBackgroundTask(
      taskRow({
        kind: 'schedule',
        status: 'waiting',
        schedule_kind: 'interval',
        schedule_expr: '10',
        prompt: '检查下载进度',
        next_run_at: new Date('2026-10-26T00:10:00Z'),
      }),
    );
    expect(task.tenantId).toBe('t1');
    expect(task.kind).toBe('schedule');
    expect(task.schedule).toEqual({ kind: 'interval', expr: '10' });
    expect(task.resumeOnFinish).toBe(true);
    expect(task.nextRunAt).toBe('2026-10-26T00:10:00.000Z');
  });

  test('布尔字段为 false 时不被默认值覆盖', () => {
    const task = mapBackgroundTask(taskRow({ resume_on_finish: false, notify_on_finish: false }));
    expect(task.resumeOnFinish).toBe(false);
    expect(task.notifyOnFinish).toBe(false);
  });
});

describe('createBackgroundTaskService.create', () => {
  test('脚本任务必须提供 command', async () => {
    const { db } = createMockDatabase();
    const service = createBackgroundTaskService({ db });
    await expect(
      service.create({
        scope,
        agentId: 'agent-1',
        sessionId: 'session-1',
        title: '下载',
        kind: 'script',
      }),
    ).rejects.toThrow('command');
  });

  test('定时任务必须提供 prompt 与合法 schedule', async () => {
    const { db } = createMockDatabase();
    const service = createBackgroundTaskService({ db });
    await expect(
      service.create({
        scope,
        agentId: 'agent-1',
        sessionId: 'session-1',
        title: '监控价格',
        kind: 'schedule',
      }),
    ).rejects.toThrow('prompt');
    await expect(
      service.create({
        scope,
        agentId: 'agent-1',
        sessionId: 'session-1',
        title: '监控价格',
        kind: 'schedule',
        prompt: '检查价格',
        schedule: { kind: 'cron', expr: 'invalid' },
      }),
    ).rejects.toThrow();
  });

  test('脚本任务写入 pending 且租户/用户来自 scope，不接受外部注入', async () => {
    const { db, exec } = createMockDatabase({ 'INSERT INTO ai_background_task': [taskRow()] });
    const service = createBackgroundTaskService({ db });
    const created = await service.create({
      scope,
      agentId: 'agent-1',
      sessionId: 'session-1',
      title: '下载',
      kind: 'script',
      command: 'curl https://example.com',
    });
    expect(created.id).toBe('task-1');
    const params = exec.calls[0]?.[1] as unknown[];
    expect(params[1]).toBe('t1');
    expect(params[2]).toBe('u1');
    expect(params[7]).toBe('pending');
  });

  test('定时任务计算首次 next_run_at', async () => {
    const { db, exec } = createMockDatabase({
      'INSERT INTO ai_background_task': [
        taskRow({ kind: 'schedule', status: 'waiting', schedule_kind: 'interval', schedule_expr: '10' }),
      ],
    });
    const service = createBackgroundTaskService({ db });
    await service.create({
      scope,
      agentId: 'agent-1',
      sessionId: 'session-1',
      title: '检查进度',
      kind: 'schedule',
      prompt: '检查下载进度',
      schedule: { kind: 'interval', expr: '10' },
    });
    const params = exec.calls[0]?.[1] as unknown[];
    // next_run_at（$17）必须是一个未来时间字符串
    expect(typeof params[16]).toBe('string');
    expect(new Date(params[16] as string).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('createBackgroundTaskService 查询', () => {
  test('list 的 SQL 同时带 tenant_id 与 user_id，并支持会话过滤', async () => {
    const { db, exec } = createMockDatabase({
      'SELECT COUNT(*)': [{ total: 1 }],
      'SELECT * FROM ai_background_task WHERE': [taskRow()],
    });
    const service = createBackgroundTaskService({ db });
    const result = await service.list(scope, { sessionId: 'session-1', page: 1, pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.list).toHaveLength(1);
    const countSql = String(exec.calls[0]?.[0]);
    expect(countSql).toContain('tenant_id = $1');
    expect(countSql).toContain('user_id = $2');
    expect(countSql).toContain('session_id = $3');
    expect(countSql).not.toContain('OR 1=1');
  });

  test('getById 带租户与用户归属条件', async () => {
    const { db, exec } = createMockDatabase({ 'SELECT * FROM ai_background_task': [taskRow()] });
    const service = createBackgroundTaskService({ db });
    const task = await service.getById('task-1', scope);
    expect(task?.id).toBe('task-1');
    expect(String(exec.calls[0]?.[0])).toContain('tenant_id = $2 AND user_id = $3');
    expect(exec.calls[0]?.[1]).toEqual(['task-1', 't1', 'u1']);
  });

  test('countActive 统计 pending/waiting/running', async () => {
    const { db, exec } = createMockDatabase({ 'SELECT COUNT(*)': [{ total: 3 }] });
    const service = createBackgroundTaskService({ db });
    expect(await service.countActive(scope)).toBe(3);
    expect(String(exec.calls[0]?.[0])).toContain("status IN ('pending', 'waiting', 'running')");
  });
});

describe('createBackgroundTaskService 状态机', () => {
  test('cancel 只允许从非终态迁移，并清空租约', async () => {
    const { db, exec } = createMockDatabase({
      UPDATE: [taskRow({ status: 'cancelled' })],
    });
    const service = createBackgroundTaskService({ db });
    const cancelled = await service.cancel('task-1', scope);
    expect(cancelled?.status).toBe('cancelled');
    const sql = String(exec.calls[0]?.[0]);
    expect(sql).toContain("status IN ($5, $6, $7, $8, $9)");
    expect(sql).toContain('next_run_at = $10');
    expect(sql).toContain('lease_owner = CASE WHEN $12 THEN NULL ELSE lease_owner END');
    expect(exec.calls[0]?.[1]).toEqual([
      'task-1',
      't1',
      'u1',
      'cancelled',
      'pending',
      'waiting',
      'running',
      'paused',
      'interrupted',
      null,
      null,
      true,
    ]);
  });

  test('pause 只允许 pending/waiting', async () => {
    const { db, exec } = createMockDatabase({
      'SELECT * FROM ai_background_task': [taskRow()],
      UPDATE: [taskRow({ status: 'paused' })],
    });
    const service = createBackgroundTaskService({ db });
    const paused = await service.pause('task-1', scope);
    expect(paused?.status).toBe('paused');
    const sql = String(exec.calls[0]?.[0]);
    expect(sql).toContain('status IN ($5, $6)');
  });

  test('resume 重新计算 next_run_at 并把状态改为 waiting', async () => {
    const { db, exec } = createMockDatabase({
      'SELECT * FROM ai_background_task': [
        taskRow({
          kind: 'schedule',
          status: 'paused',
          schedule_kind: 'interval',
          schedule_expr: '10',
        }),
      ],
      UPDATE: [taskRow({ kind: 'schedule', status: 'waiting' })],
    });
    const service = createBackgroundTaskService({ db });
    const resumed = await service.resume('task-1', scope);
    expect(resumed?.status).toBe('waiting');
    const params = exec.calls[1]?.[1] as unknown[];
    expect(params[3]).toBe('waiting');
    expect(new Date(params[5] as string).getTime()).toBeGreaterThan(Date.now());
  });

  test('claimDue 用 SKIP LOCKED 原子领取并写租约', async () => {
    const { db, exec } = createMockDatabase({
      UPDATE: [taskRow({ status: 'running', lease_owner: 'inst-1' })],
    });
    const service = createBackgroundTaskService({ db });
    const claimed = await service.claimDue({ owner: 'inst-1', limit: 3 });
    expect(claimed).toHaveLength(1);
    const sql = String(exec.calls[0]?.[0]);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("status IN ('pending', 'waiting')");
    expect(exec.calls[0]?.[1]).toEqual([3, 'inst-1', 120_000]);
  });

  test('finishScript 写终态并清租约', async () => {
    const { db, exec } = createMockDatabase();
    const service = createBackgroundTaskService({ db });
    await service.finishScript('task-1', 'completed');
    const sql = String(exec.calls[0]?.[0]);
    expect(sql).toContain('status = $2');
    expect(sql).toContain('lease_owner = NULL');
  });

  test('createRun 幂等冲突时返回 null（唯一索引兜底）', async () => {
    const { db } = createMockDatabase({ 'INSERT INTO ai_background_task_run': [] });
    const service = createBackgroundTaskService({ db });
    const task = mapBackgroundTask(taskRow({ status: 'running' }));
    const run = await service.createRun({
      task,
      trigger: 'schedule',
      scheduledAt: '2026-10-26T00:00:00.000Z',
    });
    expect(run).toBeNull();
  });

  test('reconcileStale 返回被标记的任务与运行数', async () => {
    const { db } = createMockDatabase({
      "UPDATE ai_background_task\n          SET status = 'interrupted'": [{ id: 'task-1' }],
      "UPDATE ai_background_task_run\n          SET status = 'interrupted'": [{ id: 'run-1' }],
    });
    const service = createBackgroundTaskService({ db });
    expect(await service.reconcileStale()).toEqual({ tasks: 1, runs: 1 });
  });
});

describe('兜底边界（超时/有效期/失败计数/租约回收）', () => {
  test('脚本任务 maxRuntimeSeconds 被夹到 [60, 7 天]', async () => {
    const { db, exec } = createMockDatabase({ 'INSERT INTO ai_background_task': [taskRow()] });
    const service = createBackgroundTaskService({ db });
    await service.create({
      scope,
      agentId: 'agent-1',
      sessionId: 'session-1',
      title: '下载',
      kind: 'script',
      command: 'curl x',
      maxRuntimeSeconds: 1,
    });
    const tooSmall = exec.calls[0]?.[1] as unknown[];
    expect(tooSmall[17]).toBe(60);

    await service.create({
      scope,
      agentId: 'agent-1',
      sessionId: 'session-1',
      title: '下载',
      kind: 'script',
      command: 'curl x',
      maxRuntimeSeconds: 999_999_999,
    });
    const tooLarge = exec.calls[1]?.[1] as unknown[];
    expect(tooLarge[17]).toBe(7 * 24 * 60 * 60);
  });

  test('定时任务默认 7 天有效期；expiresInHours 被夹到 [1, 720]', async () => {
    const { db, exec } = createMockDatabase({
      'INSERT INTO ai_background_task': [
        taskRow({
          kind: 'schedule',
          status: 'waiting',
          schedule_kind: 'interval',
          schedule_expr: '10',
        }),
      ],
    });
    const service = createBackgroundTaskService({ db });
    const before = Date.now();
    await service.create({
      scope,
      agentId: 'agent-1',
      sessionId: 'session-1',
      title: '检查',
      kind: 'schedule',
      prompt: '检查',
      schedule: { kind: 'interval', expr: '10' },
      expiresInHours: 9_999,
    });
    const params = exec.calls[0]?.[1] as unknown[];
    const expiresAt = new Date(params[18] as string).getTime();
    // 夹到 30 天上限
    expect(expiresAt - before).toBeGreaterThan(29 * 24 * 3_600_000);
    expect(expiresAt - before).toBeLessThanOrEqual(30 * 24 * 3_600_000 + 5_000);
  });

  test('reclaimExpiredLeases 用 SKIP LOCKED 回收过期租约的 running 任务', async () => {
    const { db, exec } = createMockDatabase({
      "SET status = 'interrupted', lease_owner = NULL": [taskRow({ status: 'interrupted' })],
    });
    const service = createBackgroundTaskService({ db });
    const reclaimed = await service.reclaimExpiredLeases(5);
    expect(reclaimed).toHaveLength(1);
    const sql = String(exec.calls[0]?.[0]);
    expect(sql).toContain('lease_expires_at < NOW()');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(exec.calls[0]?.[1]).toEqual([5]);
  });

  test('连续失败计数 + 达到阈值自动暂停', async () => {
    const { db, exec } = createMockDatabase({
      'consecutive_failures = consecutive_failures + 1': [{ consecutive_failures: 3 }],
      "status = 'paused'": [taskRow({ status: 'paused' })],
    });
    const service = createBackgroundTaskService({ db });
    expect(await service.bumpFailures('task-1')).toBe(3);
    const paused = await service.pauseForFailure('task-1', '连续失败 3 次');
    expect(paused?.status).toBe('paused');
    const pauseSql = String(exec.calls[1]?.[0]);
    expect(pauseSql).toContain("status = 'paused'");
    expect(pauseSql).toContain('next_run_at = NULL');
  });

  test('rescheduleAny 不依赖租约归属（用于失联恢复重排）', async () => {
    const { db, exec } = createMockDatabase();
    const service = createBackgroundTaskService({ db });
    await service.rescheduleAny('task-1', '2026-10-27T00:00:00.000Z', '失联重排');
    const sql = String(exec.calls[0]?.[0]);
    expect(sql).toContain('lease_owner = NULL');
    expect(sql).not.toContain('AND lease_owner = $');
    expect(exec.calls[0]?.[1]?.[1]).toBe('waiting');
  });

  test('finishById 直接结束任务（到期/兜底）', async () => {
    const { db, exec } = createMockDatabase();
    const service = createBackgroundTaskService({ db });
    await service.finishById('task-1', 'completed', '任务有效期已到，自动结束');
    const sql = String(exec.calls[0]?.[0]);
    expect(sql).toContain('next_run_at = NULL');
    expect(exec.calls[0]?.[1]?.[2]).toBe('任务有效期已到，自动结束');
  });
});
