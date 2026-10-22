/**
 * 连接生命周期管理
 *
 * 三类接入方式的行为不同：
 *   polling / long-conn  常驻连接，start 拉起、stop 断开、指数退避重连
 *   webhook              无常驻连接，只做凭证准备与健康探活
 *
 * 多实例：同一 bot 不能双实例长连接（消息会分裂）。用 cache 做「连接归属」，
 * 抢不到就置 standby；持有者崩溃后 key 30 秒过期，另一实例自动接管。
 */

import type { Cache } from '@ventostack/cache';
import { createTagLogger } from '@ventostack/core';
import { getAdapter } from '../adapters';
import { getCatalogEntry } from '../catalog';
import type { ChannelRuntimeConfig } from '../types';
import type { ChannelService } from './channel';
import type { InboundService } from './inbound';
import type { OutboundService } from './outbound';

const logger = createTagLogger('ai-channel:runtime');

const LOCK_TTL_MS = 30_000;
const RENEW_INTERVAL_MS = 10_000;
/** 出站队列补偿扫描间隔 */
const OUTBOX_INTERVAL_MS = 5_000;

export interface ChannelRuntimeDeps {
  channels: ChannelService;
  inbound: InboundService;
  outbound: OutboundService;
  cache?: Cache;
}

export interface ChannelRuntime {
  boot(): Promise<void>;
  reload(channelId: string): Promise<void>;
  /** 断开并释放归属（删除渠道前调用，此时数据库行可能已被移除） */
  stop(channelId: string): Promise<void>;
  shutdown(): Promise<void>;
  status(channelId: string): { connected: boolean; detail?: string };
}

export function createChannelRuntime(deps: ChannelRuntimeDeps): ChannelRuntime {
  const { channels, inbound, outbound, cache } = deps;
  const instanceId = crypto.randomUUID();
  const connected = new Map<string, { ok: boolean; detail?: string }>();
  /** 记录已建连渠道的类型：删除渠道后数据库行已消失，仍需据此 stop */
  const runningTypes = new Map<string, string>();
  const holding = new Set<string>();
  const timers: Array<ReturnType<typeof setInterval>> = [];

  function lockKey(channelId: string): string {
    return `ai:channel:conn:${channelId}`;
  }

  /** 抢占连接归属；已有其它实例持有时返回 false（转 standby） */
  async function acquire(channelId: string): Promise<boolean> {
    if (!cache) {
      holding.add(channelId);
      return true;
    }
    try {
      const holder = await cache.get<string>(lockKey(channelId));
      if (holder && holder !== instanceId) return false;
      await cache.set(lockKey(channelId), instanceId, { ttl: LOCK_TTL_MS });
      holding.add(channelId);
      return true;
    } catch {
      // 缓存故障时宁可连上（可用性优先），但记录状态便于排查
      holding.add(channelId);
      return true;
    }
  }

  async function release(channelId: string): Promise<void> {
    holding.delete(channelId);
    if (!cache) return;
    try {
      const holder = await cache.get<string>(lockKey(channelId));
      if (holder === instanceId) await cache.del(lockKey(channelId));
    } catch {
      // 释放失败等 TTL 自然过期
    }
  }

  /** 按渠道状态拉起或停止连接 */
  async function startChannel(cfg: ChannelRuntimeConfig): Promise<void> {
    const adapter = getAdapter(cfg.type);
    if (!adapter) {
      connected.set(cfg.id, { ok: false, detail: '渠道类型未实现' });
      await channels.setStatus(cfg.id, 'error', '渠道类型未实现');
      return;
    }

    try {
      // 连接期准备：换 token / 拉 bot 信息，失败即凭证有问题
      const patch = (await adapter.prepare?.(cfg)) ?? {};
      if (Object.keys(patch).length > 0) {
        await channels.patchRuntimeState(cfg.id, patch);
        Object.assign(cfg.config, patch);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      connected.set(cfg.id, { ok: false, detail });
      await channels.setStatus(cfg.id, 'error', detail.slice(0, 300));
      return;
    }

    const entry = getCatalogEntry(cfg.type);
    // webhook 类没有常驻连接：凭证通了就算就绪
    if (entry?.transport === 'webhook' || !adapter.start) {
      connected.set(cfg.id, { ok: true });
      await channels.setStatus(cfg.id, 'active', null);
      return;
    }

    // 长连接类：抢占归属，抢不到说明另一实例在跑，置 standby
    if (!(await acquire(cfg.id))) {
      connected.set(cfg.id, { ok: false, detail: '另一实例正在持有连接' });
      await channels.setStatus(cfg.id, 'standby', '另一实例正在持有连接');
      return;
    }

    try {
      await adapter.start(cfg, (messages) => inbound.handle(cfg.id, messages), {
        onRuntimeState: async (patch) => {
          await channels.patchRuntimeState(cfg.id, patch);
        },
        onStatus: (status) => {
          connected.set(cfg.id, status);
          void channels
            .setStatus(cfg.id, status.ok ? 'active' : 'degraded', status.detail ?? null)
            .catch(() => undefined);
        },
      });
      runningTypes.set(cfg.id, cfg.type);
      connected.set(cfg.id, { ok: true });
      await channels.setStatus(cfg.id, 'active', null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      connected.set(cfg.id, { ok: false, detail });
      await channels.setStatus(cfg.id, 'error', detail.slice(0, 300));
      await release(cfg.id);
    }
  }

  /** 断开连接并释放归属；删除渠道后仍可安全调用 */
  async function stopChannel(channelId: string): Promise<void> {
    const type = runningTypes.get(channelId);
    if (type) {
      await getAdapter(type)
        ?.stop?.(channelId)
        .catch(() => undefined);
      runningTypes.delete(channelId);
    }
    await release(channelId);
    connected.delete(channelId);
  }

  return {
    async boot(): Promise<void> {
      // 出站队列补偿：定时重试失败的发送
      const outboxTimer = setInterval(() => {
        void outbound.flush().catch((error) => {
          logger.error(
            `出站队列扫描失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }, OUTBOX_INTERVAL_MS);
      outboxTimer.unref?.();
      timers.push(outboxTimer);

      // 续期：持有者掉线后 30s 自动释放，其它实例可接管
      const renewTimer = setInterval(() => {
        for (const channelId of holding) {
          void (async () => {
            try {
              if (cache) await cache.set(lockKey(channelId), instanceId, { ttl: LOCK_TTL_MS });
            } catch {
              // 续期失败：等 TTL 过期后重新竞争，避免双持有
              holding.delete(channelId);
            }
          })();
        }
      }, RENEW_INTERVAL_MS);
      renewTimer.unref?.();
      timers.push(renewTimer);

      // 拉起所有已启用渠道
      const rows = await channels.listAllEnabled();
      for (const row of rows) {
        const cfg = await channels.getRuntimeConfig(row.id);
        if (!cfg) continue;
        await startChannel(cfg);
      }
    },

    async reload(channelId: string): Promise<void> {
      await stopChannel(channelId);
      const cfg = await channels.getRuntimeConfig(channelId);
      if (!cfg) return;
      // 渠道存在但未启用：保持已停止状态即可
      const row = await channels.get(channelId, { tenantId: cfg.tenantId, userId: cfg.userId });
      if (!row?.enabled) return;
      await startChannel(cfg);
    },

    stop: stopChannel,

    async shutdown(): Promise<void> {
      for (const timer of timers) clearInterval(timer);
      timers.length = 0;
      inbound.shutdown();
      for (const channelId of [...runningTypes.keys()]) {
        await stopChannel(channelId);
      }
      connected.clear();
    },

    status(channelId: string): { connected: boolean; detail?: string } {
      const state = connected.get(channelId);
      if (!state) return { connected: false, detail: '未启动' };
      return state.detail ? { connected: state.ok, detail: state.detail } : { connected: state.ok };
    },
  };
}
