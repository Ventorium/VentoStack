import { describe, expect, test } from 'bun:test';
import { createBackgroundTaskRunner } from '../../agent-engine/background-task-runner';
import type { RunHandle, RunRegistry } from '../../agent-engine/run-registry';
import type {
  BackgroundTask,
  BackgroundTaskRun,
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
    command: 'curl -o /workspace/model.bin https://example.com/model.bin',
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
    lease_owner: 'inst-1',
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

const runningTask = (overrides: Record<string, unknown> = {}): BackgroundTask =>
  mapBackgroundTask(taskRow({ status: 'running', run_count: 1, ...overrides }));

interface FakeState {
  claims: BackgroundTask[];
  runningScripts: BackgroundTask[];
  cancelledScripts: BackgroundTask[];
  runs: BackgroundTaskRun[];
  finishedRuns: Array<{ id: string; patch: Record<string, unknown> }>;
  finishedScripts: Array<{ id: string; status: string }>;
  rescheduled: Array<{ id: string; nextRunAt: string | null; lastError: string | null }>;
  scriptStarted: Array<{ id: string; pid: string }>;
  turns: Array<{ message: string; trigger: string }>;
  notifications: Array<{ title: string; content: string }>;
  entries: Array<Record<string, unknown>>;
  emitted: Array<{ name: string; payload: Record<string, unknown> }>;
  currentTask: BackgroundTask;
  reclaimed: BackgroundTask[];
  pausedForFailure: Array<{ id: string; reason: string }>;
  finishedById: Array<{ id: string; status: string; lastError: string | null }>;
  rescheduledAny: Array<{ id: string; nextRunAt: string | null }>;
  failureCount: number;
}

function createFakeService(state: FakeState): BackgroundTaskService {
  let runSeq = 0;
  const fake = {
    async claimDue() {
      return state.claims;
    },
    async listRunningScripts() {
      return state.runningScripts;
    },
    async listCancelledScripts() {
      return state.cancelledScripts;
    },
    async purgeExpiredSessionRuns() {
      return 0;
    },
    async createRun(params: {
      task: BackgroundTask;
      trigger: string;
      scheduledAt?: string;
    }): Promise<BackgroundTaskRun | null> {
      runSeq += 1;
      const run: BackgroundTaskRun = {
        id: `run-${runSeq}`,
        taskId: params.task.id,
        tenantId: params.task.tenantId,
        userId: params.task.userId,
        sessionId: params.task.sessionId,
        trigger: params.trigger as BackgroundTaskRun['trigger'],
        status: 'running',
        scheduledAt: params.scheduledAt ?? null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        exitCode: null,
        output: null,
        error: null,
        finalContent: null,
      };
      state.runs.push(run);
      return run;
    },
    async finishRun(id: string, patch: Record<string, unknown>) {
      state.finishedRuns.push({ id, patch });
    },
    async finishScript(id: string, status: string) {
      state.finishedScripts.push({ id, status });
    },
    async markScriptStarted(id: string, _owner: string, handle: { pid: string }) {
      state.scriptStarted.push({ id, pid: handle.pid });
    },
    async markScriptOutput() {},
    async renewLease() {
      return true;
    },
    async clearLease() {},
    async clearScriptHandle() {},
    async reschedule(id: string, _owner: string, nextRunAt: string | null, lastError: string | null) {
      state.rescheduled.push({ id, nextRunAt, lastError });
    },
    async getByIdAnyScope() {
      return state.currentTask;
    },
    async reconcileStale() {
      return { tasks: 0, runs: 0 };
    },
    async reclaimExpiredLeases() {
      return state.reclaimed.splice(0, state.reclaimed.length);
    },
    async bumpFailures() {
      state.failureCount += 1;
      return state.failureCount;
    },
    async resetFailures() {
      state.failureCount = 0;
    },
    async pauseForFailure(id: string, reason: string) {
      state.pausedForFailure.push({ id, reason });
      return { ...state.currentTask, status: 'paused' as const };
    },
    async finishById(id: string, status: string, lastError: string | null) {
      state.finishedById.push({ id, status, lastError });
    },
    async rescheduleAny(id: string, nextRunAt: string | null) {
      state.rescheduledAny.push({ id, nextRunAt });
    },
  };
  return fake as unknown as BackgroundTaskService;
}

function createFakeSessionRuns(busy = false): {
  registry: RunRegistry;
  released: boolean[];
} {
  const released: boolean[] = [];
  const registry = {
    async tryBegin(): Promise<RunHandle | null> {
      if (busy) return null;
      return {
        sessionId: 'session-1',
        token: 'token',
        kind: 'background',
        controller: new AbortController(),
        startedAt: Date.now(),
        async release() {
          released.push(true);
        },
      } as RunHandle;
    },
    async begin(): Promise<RunHandle> {
      throw new Error('not used');
    },
    abort: () => false,
    get: () => null,
    shutdown: () => {},
  };
  return { registry: registry as unknown as RunRegistry, released };
}

function createRunner(options: {
  state: FakeState;
  sessionRunsBusy?: boolean;
  command?: (command: string[]) => { stdout: string; stderr: string; exitCode: number | null };
  turnError?: string;
}) {
  const state = options.state;
  const command =
    options.command ??
    ((args: string[]) => {
      const joined = args.join(' ');
      if (joined.includes('nohup')) return { stdout: '4242\n', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    });
  const runtime = {
    instanceId: 'instance-1',
    sandboxId: 'sandbox-1',
    workspace: '/workspace',
    client: {
      async runCommand(_sandboxId: string, args: string[]) {
        const result = command(args);
        return { ...result, timedOut: false, durationMs: 5 };
      },
    },
  };
  const sessionRuns = createFakeSessionRuns(options.sessionRunsBusy ?? false);
  const runner = createBackgroundTaskRunner({
    tasks: createFakeService(state),
    instanceId: 'inst-1',
    sessionRuns: sessionRuns.registry,
    async resolveRuntime() {
      return runtime as never;
    },
    async runAgentTurn({ message }) {
      if (options.turnError) throw new Error(options.turnError);
      state.turns.push({ message, trigger: 'resume' });
      return '已完成本轮检查';
    },
    async notify(params) {
      state.notifications.push({ title: params.title, content: params.content });
    },
    emit(name, payload) {
      state.emitted.push({ name, payload });
    },
    async appendSessionEntry(_task, data) {
      state.entries.push(data);
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  });
  return { runner, sessionRuns, runtime };
}

function emptyState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    claims: [],
    runningScripts: [],
    cancelledScripts: [],
    runs: [],
    finishedRuns: [],
    finishedScripts: [],
    rescheduled: [],
    scriptStarted: [],
    turns: [],
    notifications: [],
    entries: [],
    emitted: [],
    currentTask: runningTask(),
    reclaimed: [],
    pausedForFailure: [],
    finishedById: [],
    rescheduledAny: [],
    failureCount: 0,
    ...overrides,
  };
}

describe('后台任务 runner — 定时唤醒', () => {
  test('到期任务恢复同一会话：注入任务 prompt 并安排下一次触发', async () => {
    const scheduledTask = runningTask({
      kind: 'schedule',
      schedule_kind: 'interval',
      schedule_expr: '10',
      prompt: '检查商品价格，低于 500 元就继续下单',
      next_run_at: new Date(Date.now() - 1000),
    });
    const state = emptyState({ claims: [scheduledTask], currentTask: scheduledTask });
    const { runner, sessionRuns } = createRunner({ state });

    const result = await runner.runOnce();

    expect(result.triggered).toBe(1);
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]!.message).toContain('[后台定时任务触发]');
    expect(state.turns[0]!.message).toContain('检查商品价格，低于 500 元就继续下单');
    expect(state.rescheduled).toHaveLength(1);
    expect(state.rescheduled[0]!.nextRunAt).not.toBeNull();
    expect(new Date(state.rescheduled[0]!.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
    expect(state.finishedRuns[0]!.patch.status).toBe('completed');
    expect(sessionRuns.released).toHaveLength(1);
    expect(state.notifications).toHaveLength(1);
  });

  test('会话正在运行：本轮跳过并重排，不打断在线对话', async () => {
    const scheduledTask = runningTask({
      kind: 'schedule',
      schedule_kind: 'interval',
      schedule_expr: '5',
      prompt: '检查进度',
    });
    const state = emptyState({ claims: [scheduledTask], currentTask: scheduledTask });
    const { runner } = createRunner({ state, sessionRunsBusy: true });

    const result = await runner.runOnce();

    expect(result.triggered).toBe(0);
    expect(result.skipped).toBe(1);
    expect(state.turns).toHaveLength(0);
    expect(state.finishedRuns[0]!.patch.status).toBe('skipped');
    expect(state.rescheduled).toHaveLength(1);
  });

  test('条件命令未满足：不唤醒会话，只跳过并重排', async () => {
    const scheduledTask = runningTask({
      kind: 'schedule',
      schedule_kind: 'cron',
      schedule_expr: '*/10 * * * *',
      prompt: '价格低于阈值时继续',
      condition_command: 'curl -s https://example.com/price | grep -q low',
    });
    const state = emptyState({ claims: [scheduledTask], currentTask: scheduledTask });
    const { runner } = createRunner({
      state,
      command: (args) => {
        const joined = args.join(' ');
        if (joined.includes('grep -q low')) return { stdout: '', stderr: '', exitCode: 1 };
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });

    const result = await runner.runOnce();

    expect(result.triggered).toBe(0);
    expect(state.turns).toHaveLength(0);
    expect(state.finishedRuns.some((run) => run.patch.status === 'skipped')).toBe(true);
    expect(state.rescheduled).toHaveLength(1);
  });

  test('用户取消后不再回写 waiting（结算 first-wins）', async () => {
    const scheduledTask = runningTask({
      kind: 'schedule',
      schedule_kind: 'interval',
      schedule_expr: '10',
      prompt: '检查',
    });
    const state = emptyState({
      claims: [scheduledTask],
      currentTask: runningTask({ status: 'cancelled' }),
    });
    const { runner } = createRunner({ state });

    await runner.runOnce();

    expect(state.rescheduled).toHaveLength(0);
    expect(state.finishedRuns[0]!.patch.status).toBe('completed');
  });
});

describe('后台任务 runner — 脚本任务', () => {
  test('领取 pending 脚本任务：nohup 启动并记录 PID/日志句柄', async () => {
    const scriptTask = runningTask({ exec_pid: null });
    const state = emptyState({ claims: [scriptTask] });
    const { runner } = createRunner({ state });

    await runner.runOnce();

    expect(state.scriptStarted).toEqual([{ id: scriptTask.id, pid: '4242' }]);
    expect(state.finishedScripts).toHaveLength(0);
  });

  test('脚本结束（退出码 0）：落 run 台账并把完成通知注入会话继续', async () => {
    const finished = runningTask({
      exec_pid: '4242',
      sandbox_id: 'sandbox-1',
      instance_id: 'instance-1',
      exec_log_path: '/workspace/.agent-logs/a.log',
      exec_exit_path: '/workspace/.agent-logs/a.exit',
      last_run_id: 'run-script',
      resume_on_finish: true,
    });
    const state = emptyState({ runningScripts: [finished], currentTask: finished });
    const { runner } = createRunner({
      state,
      command: (args) => {
        const joined = args.join(' ');
        if (joined.includes('a.exit')) return { stdout: 'DONE\n0\n', stderr: '', exitCode: 0 };
        if (joined.includes('tail')) {
          return { stdout: '下载完成：model.bin 8.2GB', stderr: '', exitCode: 0 };
        }
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });

    const result = await runner.runOnce();

    expect(result.scriptsFinished).toBe(1);
    // 脚本 run 台账结算为 completed（带退出码与输出）
    const scriptRun = state.finishedRuns.find((run) => run.id === 'run-script');
    expect(scriptRun?.patch.status).toBe('completed');
    expect(scriptRun?.patch.exitCode).toBe(0);
    // 完成唤醒：同一会话追加一条带输出的 user 消息
    expect(state.turns).toHaveLength(1);
    expect(state.turns[0]!.message).toContain('[后台任务完成]');
    expect(state.turns[0]!.message).toContain('不可信');
    expect(state.turns[0]!.message).toContain('model.bin 8.2GB');
    // 任务终态
    expect(state.finishedScripts).toEqual([{ id: finished.id, status: 'completed' }]);
    expect(state.notifications).toHaveLength(1);
  });

  test('脚本进程消失且无退出码：标记失败而不是假装成功', async () => {
    const lost = runningTask({
      exec_pid: '4242',
      sandbox_id: 'sandbox-1',
      instance_id: 'instance-1',
      exec_log_path: '/workspace/.agent-logs/a.log',
      exec_exit_path: '/workspace/.agent-logs/a.exit',
      last_run_id: 'run-script',
    });
    const state = emptyState({ runningScripts: [lost], currentTask: lost });
    const { runner } = createRunner({
      state,
      command: (args) => {
        const joined = args.join(' ');
        if (joined.includes('a.exit')) return { stdout: 'GONE\n', stderr: '', exitCode: 0 };
        if (joined.includes('tail')) return { stdout: 'partial output', stderr: '', exitCode: 0 };
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });

    await runner.runOnce();

    expect(state.turns).toHaveLength(0);
    expect(state.finishedRuns.find((run) => run.id === 'run-script')?.patch.status).toBe('failed');
    expect(state.finishedScripts).toEqual([{ id: lost.id, status: 'failed' }]);
  });

  test('已取消的脚本任务会 kill 进程并清理句柄', async () => {
    const cancelled = runningTask({ exec_pid: '4242', sandbox_id: 'sandbox-1' });
    const state = emptyState({ cancelledScripts: [cancelled] });
    const calls: string[] = [];
    const { runner } = createRunner({
      state,
      command: (args) => {
        calls.push(args.join(' '));
        if (args.join(' ').includes('kill -TERM')) return { stdout: '', stderr: '', exitCode: 0 };
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });

    await runner.runOnce();

    expect(calls.some((call) => call.includes('kill -TERM'))).toBe(true);
    expect(state.finishedScripts).toHaveLength(0);
  });
});

describe('后台任务 runner — 兜底（超时/有效期/失败暂停/失联回收）', () => {
  test('脚本超过最大运行时长：终止进程并按超时失败结算', async () => {
    const timedOut = runningTask({
      exec_pid: '4242',
      sandbox_id: 'sandbox-1',
      instance_id: 'instance-1',
      exec_log_path: '/workspace/.agent-logs/a.log',
      exec_exit_path: '/workspace/.agent-logs/a.exit',
      last_run_id: 'run-script',
      deadline_at: new Date(Date.now() - 60_000),
      max_runtime_seconds: 3600,
    });
    const state = emptyState({ runningScripts: [timedOut], currentTask: timedOut });
    const calls: string[] = [];
    const { runner } = createRunner({
      state,
      command: (args) => {
        calls.push(args.join(' '));
        if (args.join(' ').includes('tail')) return { stdout: 'stalled download', stderr: '', exitCode: 0 };
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    });

    const result = await runner.runOnce();

    expect(result.scriptsFinished).toBe(1);
    expect(calls.some((call) => call.includes('kill -TERM'))).toBe(true);
    const scriptRun = state.finishedRuns.find((run) => run.id === 'run-script');
    expect(scriptRun?.patch.status).toBe('failed');
    expect(String(scriptRun?.patch.error)).toContain('超时');
    expect(state.finishedScripts).toEqual([{ id: timedOut.id, status: 'failed' }]);
    expect(state.notifications.some((item) => item.content.includes('超时'))).toBe(true);
  });

  test('定时任务到有效期：不再唤醒会话，直接结束', async () => {
    const expired = runningTask({
      kind: 'schedule',
      schedule_kind: 'interval',
      schedule_expr: '10',
      prompt: '检查',
      expires_at: new Date(Date.now() - 1000),
    });
    const state = emptyState({ claims: [expired], currentTask: expired });
    const { runner } = createRunner({ state });

    const result = await runner.runOnce();

    expect(result.triggered).toBe(0);
    expect(state.turns).toHaveLength(0);
    expect(state.finishedById).toEqual([
      { id: expired.id, status: 'completed', lastError: '任务有效期已到，自动结束' },
    ]);
  });

  test('连续失败达到阈值：自动暂停任务，不再重排', async () => {
    const task = runningTask({
      kind: 'schedule',
      schedule_kind: 'interval',
      schedule_expr: '10',
      prompt: '检查',
    });
    const state = emptyState({ claims: [task], currentTask: task, failureCount: 2 });
    const { runner } = createRunner({ state, turnError: '模型服务不可用' });

    await runner.runOnce();

    expect(state.pausedForFailure).toHaveLength(1);
    expect(state.pausedForFailure[0]!.reason).toContain('连续失败');
    expect(state.rescheduled).toHaveLength(0);
    expect(state.notifications.some((item) => item.title.includes('自动暂停'))).toBe(true);
  });

  test('执行实例失联（租约过期）：定时任务自动重排，脚本任务通知中断', async () => {
    const lostSchedule = runningTask({
      id: 'task-schedule',
      kind: 'schedule',
      schedule_kind: 'interval',
      schedule_expr: '10',
      prompt: '检查',
      lease_expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const lostScript = runningTask({ id: 'task-script', lease_expires_at: new Date(Date.now() - 1000).toISOString() });
    const state = emptyState({ reclaimed: [lostSchedule, lostScript] });
    const { runner } = createRunner({ state });

    const result = await runner.runOnce();

    expect(result.failed).toBe(2);
    expect(state.rescheduledAny).toHaveLength(1);
    expect(state.rescheduledAny[0]!.id).toBe('task-schedule');
    expect(state.notifications.some((item) => item.title.includes('已自动恢复'))).toBe(true);
    expect(state.notifications.some((item) => item.title.includes('中断'))).toBe(true);
  });
});
