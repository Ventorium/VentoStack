import { describe, expect, test } from 'bun:test';
import { createBackgroundTaskTools } from '../../tools/background-task';
import type {
  BackgroundTask,
  BackgroundTaskService,
} from '../../services/background-task';
import { mapBackgroundTask } from '../../services/background-task';

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
    command: 'curl https://example.com',
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
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

interface CreatedCall {
  params: Record<string, unknown>;
}

function createFakeService(options: {
  created?: CreatedCall[];
  activeCount?: number;
  tasks?: BackgroundTask[];
} = {}) {
  const created = options.created ?? [];
  const service = {
    async countActive() {
      return options.activeCount ?? 0;
    },
    async create(params: Record<string, unknown>) {
      created.push({ params });
      return mapBackgroundTask(
        taskRow({
          id: `task-${created.length}`,
          kind: params.kind,
          title: params.title,
          status: params.kind === 'script' ? 'pending' : 'waiting',
          command: params.command ?? null,
          prompt: params.prompt ?? null,
          schedule_kind: (params.schedule as { kind?: string } | undefined)?.kind ?? null,
          schedule_expr: (params.schedule as { expr?: string } | undefined)?.expr ?? null,
          condition_command: params.conditionCommand ?? null,
          next_run_at: params.kind === 'schedule' ? new Date(Date.now() + 600_000) : null,
        }),
      );
    },
    async list() {
      return { list: options.tasks ?? [], total: (options.tasks ?? []).length };
    },
    async getById() {
      return (options.tasks ?? [])[0] ?? null;
    },
    async getRuns() {
      return [];
    },
    async cancel() {
      return mapBackgroundTask(taskRow({ status: 'cancelled' }));
    },
  };
  return { service: service as unknown as BackgroundTaskService, created };
}

function buildTools(options: {
  requiresVirtualEnvironment?: boolean;
  serviceOptions?: Parameters<typeof createFakeService>[0];
  readLog?: () => Promise<string | null>;
}) {
  const fake = createFakeService(options.serviceOptions);
  const tools = createBackgroundTaskTools({
    tasks: fake.service,
    scope: { tenantId: 't1', userId: 'u1', sessionId: 'session-1' },
    async resolveAgent() {
      return {
        agentId: 'agent-1',
        requiresVirtualEnvironment: options.requiresVirtualEnvironment !== false,
      };
    },
    ...(options.readLog ? { readLog: options.readLog } : {}),
    maxActiveTasksPerUser: 10,
  });
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return { tools, fake, byName };
}

describe('后台任务工具定义', () => {
  test('创建类工具高风险 + 需人工审批；查询/取消类无需审批', () => {
    const { byName } = buildTools({});
    expect(byName.get('background_task_start')?.requiresApproval).toBe(true);
    expect(byName.get('background_task_start')?.riskLevel).toBe('high');
    expect(byName.get('background_task_schedule')?.requiresApproval).toBe(true);
    expect(byName.get('background_task_list')?.requiresApproval).toBeUndefined();
    expect(byName.get('background_task_cancel')?.requiresApproval).toBeUndefined();
    expect(byName.get('background_task_cancel')?.riskLevel).toBe('low');
  });
});

describe('background_task_start', () => {
  test('缺少虚拟机时 fail-closed，不创建任务', async () => {
    const { byName, fake } = buildTools({ requiresVirtualEnvironment: false });
    const result = (await byName.get('background_task_start')!.handler({
      title: '下载',
      command: 'curl https://example.com',
    })) as { error?: string };
    expect(result.error).toContain('虚拟机');
    expect(fake.created).toHaveLength(0);
  });

  test('参数为空或超长时拒绝', async () => {
    const { byName } = buildTools({});
    const handler = byName.get('background_task_start')!.handler;
    expect(((await handler({ title: '', command: 'ls' })) as { error?: string }).error).toBeTruthy();
    expect(
      ((await handler({ title: 'x'.repeat(200), command: 'ls' })) as { error?: string }).error,
    ).toBeTruthy();
    expect(((await handler({ title: '下载', command: '' })) as { error?: string }).error).toBeTruthy();
  });

  test('用户并发上限：达到上限拒绝创建', async () => {
    const { byName } = buildTools({ serviceOptions: { activeCount: 10 } });
    const result = (await byName.get('background_task_start')!.handler({
      title: '下载',
      command: 'curl https://example.com',
    })) as { error?: string };
    expect(result.error).toContain('上限');
  });

  test('创建脚本任务：任务归属当前租户/用户/会话与当前 Agent', async () => {
    const { byName, fake } = buildTools({});
    const result = (await byName.get('background_task_start')!.handler({
      title: '下载模型',
      command: 'curl -o model.bin https://example.com/model.bin',
    })) as { task?: { id: string } };
    expect(result.task?.id).toBe('task-1');
    const params = fake.created[0]!.params;
    expect(params.kind).toBe('script');
    expect((params.scope as { tenantId: string }).tenantId).toBe('t1');
    expect(params.agentId).toBe('agent-1');
    expect(params.sessionId).toBe('session-1');
  });
});

describe('background_task_schedule', () => {
  test('scheduleType 非法时拒绝', async () => {
    const { byName } = buildTools({});
    const result = (await byName.get('background_task_schedule')!.handler({
      title: '监控',
      prompt: '检查价格',
      scheduleType: 'hourly',
      scheduleValue: '1',
    })) as { error?: string };
    expect(result.error).toContain('scheduleType');
  });

  test('条件命令需要虚拟机环境', async () => {
    const { byName } = buildTools({ requiresVirtualEnvironment: false });
    const result = (await byName.get('background_task_schedule')!.handler({
      title: '监控',
      prompt: '检查价格',
      scheduleType: 'interval',
      scheduleValue: '10',
      conditionCommand: 'curl -s https://example.com/price',
    })) as { error?: string };
    expect(result.error).toContain('虚拟机');
  });

  test('创建定时任务：透传 prompt/周期/上限', async () => {
    const { byName, fake } = buildTools({});
    const result = (await byName.get('background_task_schedule')!.handler({
      title: '监控价格',
      prompt: '低于 500 元继续下单',
      scheduleType: 'cron',
      scheduleValue: '*/10 * * * *',
      maxRuns: 20,
    })) as { task?: { id: string; nextRunAt: string | null } };
    expect(result.task?.nextRunAt).toBeTruthy();
    const params = fake.created[0]!.params;
    expect(params.kind).toBe('schedule');
    expect(params.schedule).toEqual({ kind: 'cron', expr: '*/10 * * * *' });
    expect(params.maxRuns).toBe(20);
  });
});

describe('查询与取消', () => {
  test('list 默认只看当前会话', async () => {
    const { byName, fake } = buildTools({ serviceOptions: { tasks: [] } });
    const calls: Array<Record<string, unknown>> = [];
    (fake.service as unknown as { list: (scope: unknown, params: unknown) => Promise<unknown> }).list =
      async (_scope: unknown, params: unknown) => {
        calls.push(params as Record<string, unknown>);
        return { list: [], total: 0 };
      };
    await byName.get('background_task_list')!.handler({});
    expect(calls[0]!.sessionId).toBe('session-1');
    await byName.get('background_task_list')!.handler({ scope: 'user' });
    expect(calls[1]!.sessionId).toBeUndefined();
  });

  test('status 附带日志尾部（includeLog）', async () => {
    const { byName } = buildTools({
      serviceOptions: { tasks: [mapBackgroundTask(taskRow())] },
      readLog: async () => 'tail of log',
    });
    const result = (await byName.get('background_task_status')!.handler({
      taskId: 'task-1',
      includeLog: true,
    })) as { log?: string };
    expect(result.log).toBe('tail of log');
  });

  test('cancel 不传 taskId 时批量取消当前会话活跃任务', async () => {
    const active = mapBackgroundTask(taskRow({ status: 'waiting' }));
    const { byName, fake } = buildTools({ serviceOptions: { tasks: [active] } });
    const cancelled: string[] = [];
    (fake.service as unknown as { cancel: (id: string) => Promise<unknown> }).cancel = async (
      id: string,
    ) => {
      cancelled.push(id);
      return active;
    };
    const result = (await byName.get('background_task_cancel')!.handler({})) as { count: number };
    expect(cancelled).toEqual(['task-1']);
    expect(result.count).toBe(1);
  });

  test('cancel 指定不存在任务时返回错误', async () => {
    const { byName } = buildTools({ serviceOptions: { tasks: [] } });
    const result = (await byName.get('background_task_cancel')!.handler({
      taskId: 'missing',
    })) as { error?: string };
    expect(result.error).toBeTruthy();
  });
});

describe('兜底参数透传', () => {
  test('background_task_start 透传 maxRuntimeSeconds', async () => {
    const { byName, fake } = buildTools({});
    await byName.get('background_task_start')!.handler({
      title: '下载',
      command: 'curl https://example.com',
      maxRuntimeSeconds: 7200,
    });
    expect(fake.created[0]!.params.maxRuntimeSeconds).toBe(7200);
  });

  test('background_task_schedule 透传 expiresInHours', async () => {
    const { byName, fake } = buildTools({});
    await byName.get('background_task_schedule')!.handler({
      title: '监控',
      prompt: '检查价格',
      scheduleType: 'interval',
      scheduleValue: '10',
      expiresInHours: 48,
    });
    expect(fake.created[0]!.params.expiresInHours).toBe(48);
  });
});
