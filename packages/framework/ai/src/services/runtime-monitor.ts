import type { Database } from '@ventostack/database';
import type { RuntimeSettings } from '../agent-runtime/settings';
import type { RuntimeClientRegistry } from './runtime-client-registry';
import type { RuntimeHostService } from './runtime-host';
import type { RuntimeInstanceService } from './runtime-instance';

export interface RuntimeHostMonitor {
  start(): void;
  stop(): void;
  runOnce(): Promise<{ checked: number; online: number; failed: number }>;
}

export function createRuntimeHostMonitor(deps: {
  db: Database;
  settings: RuntimeSettings;
  hostService: RuntimeHostService;
  instanceService: RuntimeInstanceService;
  clients: RuntimeClientRegistry;
}): RuntimeHostMonitor {
  const { db, settings, hostService, instanceService, clients } = deps;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function checkHost(hostId: string): Promise<boolean> {
    const item = await hostService.check(hostId);
    if (item.status !== 'online') return false;
    try {
      const client = await clients.get(hostId);
      const sandboxes = await client.listSandboxes();
      const reconciled = await instanceService.reconcileHost(hostId, sandboxes);
      if (reconciled.orphans.length > 0) {
        const current = await hostService.getById(hostId);
        if (current) {
          await db.raw(
            `UPDATE ai_runtime_host
             SET usage_json = jsonb_set(usage_json, '{orphans}', to_jsonb($2::int), true),
                 updated_at = NOW()
             WHERE id = $1`,
            [hostId, reconciled.orphans.length],
          );
        }
      }
    } catch {
      // 实例对账失败不影响宿主在线状态；下一轮重试
    }
    return true;
  }

  async function runOnce(): Promise<{ checked: number; online: number; failed: number }> {
    if (running) return { checked: 0, online: 0, failed: 0 };
    running = true;
    try {
      const hosts = (await hostService.list()).filter(
        (host) => host.enabled && Boolean(host.baseUrl),
      );
      let online = 0;
      let failed = 0;
      const concurrency = 4;
      for (let index = 0; index < hosts.length; index += concurrency) {
        const batch = hosts.slice(index, index + concurrency);
        const results = await Promise.allSettled(batch.map((host) => checkHost(host.id)));
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) online += 1;
          else failed += 1;
        }
      }
      return { checked: hosts.length, online, failed };
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (timer) return;
      const tick = () => {
        void runOnce().catch((error) => {
          console.error('[ai] 虚拟机宿主监控失败:', error);
        });
      };
      tick();
      timer = setInterval(tick, settings.hostCheckIntervalMs);
      // 不阻止进程退出
      (timer as unknown as { unref?: () => void }).unref?.();
    },
    stop(): void {
      if (timer) clearInterval(timer);
      timer = null;
    },
    runOnce,
  };
}
