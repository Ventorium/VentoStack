/**
 * @ventostack/monitor - 系统监控服务
 *
 * 纯运行时聚合，无数据库表。
 * 响应结构对齐前端类型定义。
 */

import type { HealthCheck, HealthStatus as FrameworkHealthStatus } from "@ventostack/observability";
import type { Database } from "@ventostack/database";

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
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  memoryUsed: number;
  uptime: number;
  nodeVersion: string;
  bunVersion: string;
}

/** 缓存状态（对齐前端 CacheStatus） */
export interface CacheStatus {
  keyCount: number;
  hitRate: number;
  memoryUsage: number;
}

/** 数据源状态（对齐前端 DataSourceStatus） */
export interface DataSourceStatus {
  status: string;
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
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
  forceLogout(sessionId: string, userId: string): Promise<void>;
}

/** 缓存统计提供者 */
export interface CacheStatsProvider {
  getKeyCount(): Promise<number>;
  getHitRate(): Promise<number>;
  getMemoryUsage(): Promise<number>;
}

/** 监控服务依赖 */
export interface MonitorServiceDeps {
  healthCheck: HealthCheck;
  db?: Database;
  cacheStatsProvider?: () => Promise<CacheStatus>;
  dataSourceStatsProvider?: () => Promise<DataSourceStatus>;
}

export function createMonitorService(deps: MonitorServiceDeps): MonitorService {
  const { healthCheck, db, cacheStatsProvider, dataSourceStatsProvider } = deps;

  return {
    async getServerStatus(): Promise<ServerStatus> {
      const mem = process.memoryUsage();

      let systemTotal = 0;
      let systemFree = 0;
      let cpuModel = "unknown";
      let cpuCores = 1;
      let loadAvg: number[] = [0, 0, 0];

      try {
        const os = await import("node:os");
        systemTotal = os.totalmem();
        systemFree = os.freemem();
        const cpus = os.cpus();
        cpuCores = cpus.length;
        cpuModel = cpus[0]?.model ?? "unknown";
        loadAvg = os.loadavg();
      } catch {
        systemTotal = mem.heapTotal;
        systemFree = mem.heapTotal - mem.heapUsed;
      }

      const systemUsed = systemTotal - systemFree;

      return {
        cpuUsage: cpuCores > 0 ? loadAvg[0]! / cpuCores : 0,
        memoryUsage: systemTotal > 0 ? systemUsed / systemTotal : 0,
        memoryTotal: systemTotal,
        memoryUsed: systemUsed,
        uptime: Math.floor(process.uptime()),
        nodeVersion: process.versions.node ?? "",
        bunVersion: Bun.version,
      };
    },

    async getCacheStats(): Promise<CacheStatus> {
      if (cacheStatsProvider) {
        return cacheStatsProvider();
      }
      return { keyCount: 0, hitRate: 0, memoryUsage: 0 };
    },

    async getDataSourceStatus(): Promise<DataSourceStatus> {
      if (dataSourceStatsProvider) {
        return dataSourceStatsProvider();
      }
      // 默认通过 db 做简单探测
      if (db) {
        try {
          await db.raw("SELECT 1");
          return { status: "UP", activeConnections: 1, idleConnections: 0, maxConnections: 0 };
        } catch {
          return { status: "DOWN", activeConnections: 0, idleConnections: 0, maxConnections: 0 };
        }
      }
      return { status: "UNKNOWN", activeConnections: 0, idleConnections: 0, maxConnections: 0 };
    },

    async getHealthStatus(): Promise<HealthStatus> {
      const raw: FrameworkHealthStatus = await healthCheck.ready();
      const checks: HealthCheckItem[] = Object.entries(raw.checks).map(([name, result]) => {
        const item: HealthCheckItem = {
          name,
          status: result.status === "ok" ? "UP" : "DOWN",
        };
        if (result.message !== undefined) item.details = result.message;
        if (result.duration !== undefined) item.duration = result.duration;
        return item;
      });
      return {
        status: raw.status === "ok" ? "UP" : raw.status === "degraded" ? "DEGRADED" : "DOWN",
        checks,
      };
    },

    async getOnlineUsers(): Promise<OnlineUser[]> {
      if (!db) return [];

      // 查询最近 30 分钟内成功登录的记录作为在线用户近似
      const rows = await db.raw(
        `SELECT l.id, l.user_id, l.username, l.ip, l.browser, l.os, l.login_at,
                u.nickname
         FROM sys_login_log l
         LEFT JOIN sys_user u ON l.user_id = u.id AND u.deleted_at IS NULL
         WHERE l.status = 1 AND l.login_at > NOW() - INTERVAL '30 minutes'
         ORDER BY l.login_at DESC
         LIMIT 100`,
      ) as Array<{
        id: string;
        user_id: string;
        username: string;
        ip: string;
        browser: string;
        os: string;
        login_at: string;
        nickname: string;
      }>;

      return rows.map((row) => ({
        sessionId: row.id,
        userId: row.user_id,
        username: row.username,
        nickname: row.nickname ?? "",
        ip: row.ip ?? "",
        browser: row.browser ?? "",
        os: row.os ?? "",
        loginAt: row.login_at,
        lastAccessAt: row.login_at,
      }));
    },

    async forceLogout(sessionId: string, userId: string): Promise<void> {
      // TODO: 接入 SessionManager.destroy(sessionId) 实现真正的强制下线
      void sessionId;
      void userId;
    },
  };
}
