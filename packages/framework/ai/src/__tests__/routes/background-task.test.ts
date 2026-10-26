import { describe, expect, test } from 'bun:test';
import type { Router } from '@ventostack/core';
import { createBackgroundTaskRoutes } from '../../routes/background-task';
import type { BackgroundTask, BackgroundTaskService } from '../../services/background-task';
import { mapBackgroundTask } from '../../services/background-task';

const passMiddleware = async (_ctx: unknown, next: () => Promise<Response>) => next();

function taskRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'task-1',
    tenant_id: 't1',
    user_id: 'u1',
    agent_id: 'agent-1',
    session_id: 'session-1',
    title: '下载模型',
    kind: 'script',
    status: 'completed',
    command: 'curl https://example.com',
    condition_command: null,
    prompt: null,
    schedule_kind: null,
    schedule_expr: null,
    resume_on_finish: true,
    notify_on_finish: true,
    max_runs: 100,
    run_count: 1,
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

interface Calls {
  list: Array<{ scope: unknown; params: unknown }>;
  cancel: string[];
  pause: string[];
  resume: string[];
  enqueue: string[];
  remove: string[];
}

function createRouterWith(
  options: {
    task?: BackgroundTask | null;
    removeResult?: boolean;
    readTaskLog?: (task: BackgroundTask) => Promise<string | null>;
  } = {},
): { router: Router; calls: Calls } {
  const calls: Calls = { list: [], cancel: [], pause: [], resume: [], enqueue: [], remove: [] };
  const task = options.task === undefined ? mapBackgroundTask(taskRow()) : options.task;
  const service = {
    async list(scope: unknown, params: unknown) {
      calls.list.push({ scope, params });
      return { list: task ? [task] : [], total: task ? 1 : 0 };
    },
    async getById() {
      return task;
    },
    async getRuns() {
      return [];
    },
    async cancel(_id: string) {
      calls.cancel.push(_id);
      return task ? { ...task, status: 'cancelled' as const } : null;
    },
    async pause(id: string) {
      calls.pause.push(id);
      return task;
    },
    async resume(id: string) {
      calls.resume.push(id);
      return task;
    },
    async enqueueNow(id: string) {
      calls.enqueue.push(id);
      return task;
    },
    async remove(id: string) {
      calls.remove.push(id);
      return options.removeResult ?? true;
    },
  };
  const router = createBackgroundTaskRoutes(
    {
      tasks: service as unknown as BackgroundTaskService,
      ...(options.readTaskLog ? { readTaskLog: options.readTaskLog } : {}),
    },
    passMiddleware as never,
    () => passMiddleware as never,
  );
  return { router, calls };
}

function findHandler(router: Router, method: string, path: string) {
  const route = router.routes().find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`${method} ${path} route not found`);
  return route.handler;
}

async function call(
  router: Router,
  method: string,
  path: string,
  params: Record<string, string> = {},
  query: Record<string, unknown> = {},
  user: { id: string; tenantId: string } | null = { id: 'u1', tenantId: 't1' },
): Promise<{ status: number; body: unknown }> {
  const handler = findHandler(router, method, path);
  const response = (await handler({
    request: new Request(`http://test${path}`, { method }),
    params,
    query,
    user,
  } as never)) as Response;
  return { status: response.status, body: await response.json() };
}

describe('后台任务路由', () => {
  test('列表按当前用户/租户过滤，并回传分页结构', async () => {
    const { router, calls } = createRouterWith();
    const result = await call(router, 'GET', '/api/ai/background-tasks', {}, { page: 2, pageSize: 10 });
    expect(result.status).toBe(200);
    expect(calls.list[0]!.scope).toEqual({ tenantId: 't1', userId: 'u1' });
    expect((calls.list[0]!.params as { page: number }).page).toBe(2);
  });

  test('非法 status 返回 400（不把脏条件带进 SQL）', async () => {
    const { router } = createRouterWith();
    const result = await call(router, 'GET', '/api/ai/background-tasks', {}, { status: 'whatever' });
    expect(result.status).toBe(400);
  });

  test('跨租户/跨用户按不存在处理（404）', async () => {
    const { router } = createRouterWith({ task: null });
    const detail = await call(router, 'GET', '/api/ai/background-tasks/:id', { id: 'task-1' });
    expect(detail.status).toBe(404);
    const cancel = await call(router, 'POST', '/api/ai/background-tasks/:id/cancel', {
      id: 'task-1',
    });
    expect(cancel.status).toBe(404);
    const removed = await call(router, 'DELETE', '/api/ai/background-tasks/:id', { id: 'task-1' });
    expect(removed.status).toBe(404);
  });

  test('运行中的任务不允许直接删除（先取消）', async () => {
    const { router, calls } = createRouterWith({
      task: mapBackgroundTask(taskRow({ status: 'running' })),
    });
    const result = await call(router, 'DELETE', '/api/ai/background-tasks/:id', { id: 'task-1' });
    expect(result.status).toBe(409);
    expect(calls.remove).toHaveLength(0);
  });

  test('取消/暂停/恢复/立即执行分别调用对应服务方法', async () => {
    const { router, calls } = createRouterWith();
    expect(
      (await call(router, 'POST', '/api/ai/background-tasks/:id/cancel', { id: 'task-1' })).status,
    ).toBe(200);
    expect(
      (await call(router, 'POST', '/api/ai/background-tasks/:id/pause', { id: 'task-1' })).status,
    ).toBe(200);
    expect(
      (await call(router, 'POST', '/api/ai/background-tasks/:id/resume', { id: 'task-1' })).status,
    ).toBe(200);
    expect(
      (await call(router, 'POST', '/api/ai/background-tasks/:id/run', { id: 'task-1' })).status,
    ).toBe(200);
    expect(calls.cancel).toEqual(['task-1']);
    expect(calls.pause).toEqual(['task-1']);
    expect(calls.resume).toEqual(['task-1']);
    expect(calls.enqueue).toEqual(['task-1']);
  });

  test('日志接口读取脚本日志；读取失败返回 404', async () => {
    const ok = createRouterWith({ readTaskLog: async () => 'log tail' });
    const first = await call(ok.router, 'GET', '/api/ai/background-tasks/:id/log', { id: 'task-1' });
    expect(first.status).toBe(200);
    expect((first.body as { data?: { log?: string } }).data?.log).toBe('log tail');

    const failed = createRouterWith({ readTaskLog: async () => null });
    const second = await call(failed.router, 'GET', '/api/ai/background-tasks/:id/log', {
      id: 'task-1',
    });
    expect(second.status).toBe(404);
  });

  test('用户所属租户缺失时 fail-closed 为 default 租户（不会跨租户读）', async () => {
    const { router, calls } = createRouterWith();
    await call(router, 'GET', '/api/ai/background-tasks', {}, {}, null);
    expect(calls.list[0]!.scope).toEqual({ tenantId: 'default', userId: '' });
  });
});
