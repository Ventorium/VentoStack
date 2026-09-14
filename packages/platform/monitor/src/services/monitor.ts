/**
 * @ventostack/monitor - 系统监控服务
 *
 * 纯运行时聚合，无数据库表。
 * 响应结构对齐前端类型定义。
 */

import type { Database } from '@ventostack/database';
import type { AuthSessionManager, MultiDeviceManager, SessionManager } from '@ventostack/auth';
import { NotFoundError, ServerError } from '@ventostack/core';
import type { HealthStatus as FrameworkHealthStatus, HealthCheck } from '@ventostack/observability';
import {
  calculateCpuUsage,
  createSystemMetricsProvider,
  type SystemMetricsProvider,
} from './system-metrics';

/** 在线用户 */
export interface OnlineUser {
  sessionId: string;
  userId: string;
  username: string;
  nickname: string;
  ip: string;
  browser: string;
  os: string;
  loginAt: string;
  lastAccessAt: string;
}

/** 服务器状态（对齐前端 ServerStatus） */
export interface ServerStatus {
  cpu: { available: boolean; usage: number; model: string; cores: number };
  memory: { available: boolean; usage: number; total: number; used: number };
  disk: { available: boolean; usage: number; total: number; used: number; mount: string };
  os: { platform: string; arch: string; hostname: string };
  process: {
    pid: number;
    uptime: number;
    bunVersion: string;
    nodeCompatibilityVersion: string;
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  collectedAt: string;
}

/** 缓存状态（对齐前端 CacheStatus） */
export interface CacheStatus {
  available: boolean;
  keyCount: number;
  hitRate?: number;
  memory: string;
  uptime?: string;
  version?: string;
}

/** 数据源状态（对齐前端 DataSourceStatus） */
export interface DataSourceStatus {
  connected: boolean;
  metricsAvailable: boolean;
  poolSize: number;
  activeConnections: number;
  idleConnections: number;
}

/** 健康检查项（对齐前端 HealthCheckItem） */
export interface HealthCheckItem {
  name: string;
  status: string;
  details?: string;
  duration?: number;
}

/** 健康状态（对齐前端 HealthStatus） */
export interface HealthStatus {
  status: string;
  checks: HealthCheckItem[];
}

/** 监控服务接口 */
export interface MonitorService {
  getServerStatus(): Promise<ServerStatus>;
  getCacheStats(): Promise<CacheStatus>;
  getDataSourceStatus(): Promise<DataSourceStatus>;
  getHealthStatus(): Promise<HealthStatus>;
  getOnlineUsers(): Promise<OnlineUser[]>;
  forceLogout(activityId: string): Promise<void>;
}

/** 缓存统计提供者 */
export interface CacheStatsProvider {
  getKeyCount(): Promise<number>;
  getHitRate(): Promise<number>;
  getMemoryUsage(): Promise<string>;
}

/** 监控服务依赖 */
export interface MonitorServiceDeps {
  healthCheck: HealthCheck;
  tenantId: string;
  db?: Database;
  authSessionManager?: AuthSessionManager;
  sessionManager?: SessionManager;
  multiDeviceManager?: MultiDeviceManager;
  systemMetricsProvider?: SystemMetricsProvider;
  cacheStatsProvider?: () => Promise<CacheStatus>;
  dataSourceStatsProvider?: () => Promise<DataSourceStatus>;
}

export function createMonitorService(deps: MonitorServiceDeps): MonitorService {
  const {
    healthCheck,
    tenantId,
    db,
    authSessionManager,
    sessionManager,
    multiDeviceManager,
    cacheStatsProvider,
    dataSourceStatsProvider,
    systemMetricsProvider = createSystemMetricsProvider(),
  } = deps;

  return {
    async getServerStatus(): Promise<ServerStatus> {
      const before = systemMetricsProvider.getCpuSnapshot();
      const diskPromise = systemMetricsProvider.getDiskUsage();
      await systemMetricsProvider.wait(100);
      const after = systemMetricsProvider.getCpuSnapshot();
      const cpuInfo = systemMetricsProvider.getCpuInfo();
      const memoryInfo = systemMetricsProvider.getMemory();
      const osInfo = systemMetricsProvider.getOsInfo();
      const disk = await diskPromise;
      const processMemory = process.memoryUsage();
      const systemUsed = Math.max(0, memoryInfo.total - memoryInfo.free);

      return {
        cpu: {
          available: before.length > 0 && after.length > 0,
          usage: calculateCpuUsage(before, after),
          model: cpuInfo.model,
          cores: cpuInfo.cores,
        },
        memory: {
          available: memoryInfo.total > 0,
          usage: memoryInfo.total > 0 ? Math.min(1, systemUsed / memoryInfo.total) : 0,
          total: memoryInfo.total,
          used: systemUsed,
        },
        disk,
        os: osInfo,
        process: {
          pid: process.pid,
          uptime: Math.floor(process.uptime()),
          bunVersion: Bun.version,
          nodeCompatibilityVersion: process.versions.node ?? '',
          rss: processMemory.rss,
          heapUsed: processMemory.heapUsed,
          heapTotal: processMemory.heapTotal,
        },
        collectedAt: new Date().toISOString(),
      };
    },

    async getCacheStats(): Promise<CacheStatus> {
      if (cacheStatsProvider) {
        return cacheStatsProvider();
      }
      return { available: false, keyCount: 0, memory: '0B' };
    },

    async getDataSourceStatus(): Promise<DataSourceStatus> {
      if (dataSourceStatsProvider) {
        return dataSourceStatsProvider();
      }
      // 默认通过 db 做简单探测
      if (db) {
        try {
          await db.raw('SELECT 1');
          return {
            connected: true,
            metricsAvailable: false,
            poolSize: 0,
            activeConnections: 0,
            idleConnections: 0,
          };
        } catch {
          return {
            connected: false,
            metricsAvailable: false,
            poolSize: 0,
            activeConnections: 0,
            idleConnections: 0,
          };
        }
      }
      return {
        connected: false,
        metricsAvailable: false,
        poolSize: 0,
        activeConnections: 0,
        idleConnections: 0,
      };
    },

    async getHealthStatus(): Promise<HealthStatus> {
      const raw: FrameworkHealthStatus = await healthCheck.ready();
      const checks: HealthCheckItem[] = Object.entries(raw.checks).map(([name, result]) => {
        const item: HealthCheckItem = {
          name,
          status: result.status === 'ok' ? 'UP' : 'DOWN',
        };
        if (result.message !== undefined) item.details = result.message;
        if (result.duration !== undefined) item.duration = result.duration;
        return item;
      });
      return {
        status: raw.status === 'ok' ? 'UP' : raw.status === 'degraded' ? 'DEGRADED' : 'DOWN',
        checks,
      };
    },

    async getOnlineUsers(): Promise<OnlineUser[]> {
      if (!db || !multiDeviceManager) return [];

      // 查询最近 30 分钟内成功登录的记录作为在线用户近似
      const rows = (await db.raw(
        `SELECT recent.id, recent.user_id, recent.username, recent.ip, recent.browser,
                recent.os, recent.login_at, u.nickname
         FROM (
           SELECT DISTINCT ON (l.user_id)
                  l.id, l.user_id, l.username, l.ip, l.browser, l.os, l.login_at
           FROM sys_login_log l
           WHERE l.tenant_id = $1 AND l.status = 1 AND l.user_id IS NOT NULL
             AND l.login_at > NOW() - INTERVAL '30 minutes'
           ORDER BY l.user_id, l.login_at DESC
         ) recent
         LEFT JOIN sys_user u
           ON recent.user_id = u.id AND u.tenant_id = $1 AND u.deleted_at IS NULL
         ORDER BY recent.login_at DESC
         LIMIT 100`,
        [tenantId],
      )) as Array<{
        id: string;
        user_id: string;
        username: string;
        ip: string;
        browser: string;
        os: string;
        login_at: string;
        nickname: string;
      }>;

      return rows.flatMap((row) => {
        const latestSession = multiDeviceManager
          .getSessions(row.user_id)
          .sort((left, right) => right.lastActiveAt - left.lastActiveAt)[0];
        if (!latestSession) return [];
        return [
          {
            sessionId: latestSession.sessionId,
            userId: row.user_id,
            username: row.username,
            nickname: row.nickname ?? '',
            ip: row.ip ?? '',
            browser: row.browser ?? '',
            os: row.os ?? '',
            loginAt: new Date(latestSession.createdAt).toISOString(),
            lastAccessAt: new Date(latestSession.lastActiveAt).toISOString(),
          },
        ];
      });
    },

    async forceLogout(sessionId: string): Promise<void> {
      if (!db || !authSessionManager || !sessionManager) {
        throw new ServerError('在线会话管理不可用', 503, 'ONLINE_SESSION_UNAVAILABLE');
      }
      const session = await sessionManager.get(sessionId);
      const userId = typeof session?.data.userId === 'string' ? session.data.userId : undefined;
      if (!userId) throw new NotFoundError('在线用户不存在');
      const rows = (await db.raw(
        `SELECT id FROM sys_user
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [userId, tenantId],
      )) as Array<{ id: string }>;
      if (rows.length === 0) throw new NotFoundError('在线用户不存在');
      await authSessionManager.forceLogout(userId);
    },
  };
}
