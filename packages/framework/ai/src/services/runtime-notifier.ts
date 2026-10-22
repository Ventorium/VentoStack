import type { Database } from '@ventostack/database';
import type { RuntimeSettings } from '../agent-runtime/settings';
import type { NotificationServiceLike } from '../module';
import type { RuntimeInstanceService } from './runtime-instance';

export interface RuntimeNotifier {
  runOnce(): Promise<{ idleNotified: number; staleNotified: number }>;
}

interface IdleRow {
  id: string;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  agent_name: string | null;
  last_active_at: Date | string | null;
  updated_at: Date | string | null;
  created_at: Date | string | null;
}

function asDate(value: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function createRuntimeNotifier(deps: {
  db: Database;
  settings: RuntimeSettings;
  instanceService: RuntimeInstanceService;
  notification?: NotificationServiceLike;
  notifyPlatformAdmins?: (params: {
    tenantId: string;
    title: string;
    content: string;
  }) => Promise<void>;
}): RuntimeNotifier {
  const { db, settings, instanceService, notification, notifyPlatformAdmins } = deps;

  async function runOnce(): Promise<{ idleNotified: number; staleNotified: number }> {
    const rows = (await db.raw(
      `SELECT r.id, r.tenant_id, r.user_id, r.agent_id, a.name AS agent_name,
              r.last_active_at, r.updated_at, r.created_at
       FROM ai_agent_runtime r
       LEFT JOIN ai_agent a ON a.id = r.agent_id AND a.tenant_id = r.tenant_id
       WHERE r.state <> 'destroyed'
         AND (r.idle_notified_at IS NULL OR r.stale_notified_at IS NULL)`,
    )) as IdleRow[];
    const now = Date.now();
    const idleMs = settings.idleNotifyDays * 86_400_000;
    const staleMs = settings.staleNotifyDays * 86_400_000;
    let idleNotified = 0;
    let staleNotified = 0;

    for (const row of rows) {
      const lastActive = asDate(row.last_active_at) ?? asDate(row.updated_at) ?? asDate(row.created_at);
      if (!lastActive) continue;
      const idleFor = now - lastActive.getTime();
      const agentName = row.agent_name ?? row.agent_id;
      if (idleFor >= idleMs && notification) {
        const existing = (await db.raw(
          'SELECT idle_notified_at FROM ai_agent_runtime WHERE id = $1',
          [row.id],
        )) as Array<{ idle_notified_at: Date | string | null }>;
        if (!existing[0]?.idle_notified_at) {
          try {
            await notification.send({
              receiverId: row.user_id,
              channel: 'in_app',
              title: '虚拟机环境闲置提醒',
              content: `你的 Agent「${agentName}」虚拟机已闲置超过 ${settings.idleNotifyDays} 天。环境仍会保留，你可以继续使用；如需释放，请联系平台管理员或在环境列表中操作。`,
            });
            await instanceService.markIdleNotified(row.id);
            idleNotified += 1;
          } catch (error) {
            console.error('[ai] 发送虚拟机闲置提醒失败:', error);
          }
        }
      }
      if (idleFor >= staleMs && notifyPlatformAdmins) {
        const existing = (await db.raw(
          'SELECT stale_notified_at FROM ai_agent_runtime WHERE id = $1',
          [row.id],
        )) as Array<{ stale_notified_at: Date | string | null }>;
        if (!existing[0]?.stale_notified_at) {
          try {
            await notifyPlatformAdmins({
              tenantId: row.tenant_id,
              title: '虚拟机长期闲置提醒',
              content: `用户 ${row.user_id} 的 Agent「${agentName}」虚拟机已闲置超过 ${settings.staleNotifyDays} 天，建议复核是否释放。`,
            });
            await instanceService.markStaleNotified(row.id);
            staleNotified += 1;
          } catch (error) {
            console.error('[ai] 发送平台管理员闲置提醒失败:', error);
          }
        }
      }
    }
    return { idleNotified, staleNotified };
  }

  return { runOnce };
}
