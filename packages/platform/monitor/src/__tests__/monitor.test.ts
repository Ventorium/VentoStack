/**
 * @ventostack/monitor - 监控服务测试
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AuthSessionManager, MultiDeviceManager, SessionManager } from '@ventostack/auth';
import type { Database } from '@ventostack/database';
import { createMonitorService } from '../services/monitor';
import { createMockDatabase, createMockExecutor, createMockHealthCheck } from './helpers';

describe('MonitorService', () => {
  let healthCheck: ReturnType<typeof createMockHealthCheck>;
  let service: ReturnType<typeof createMonitorService>;

  beforeEach(() => {
    healthCheck = createMockHealthCheck();
    const mockExec = createMockExecutor();
    const { db } = createMockDatabase(mockExec);
    service = createMonitorService({ healthCheck, db, tenantId: 'tenant-a' });
  });

  describe('getServerStatus', () => {
    it('should return server status', async () => {
      const status = await service.getServerStatus();

      expect(status.process.uptime).toBeGreaterThanOrEqual(0);
      expect(status.memory.total).toBeGreaterThanOrEqual(0);
      expect(status.memory.used).toBeGreaterThanOrEqual(0);
      expect(status.memory.usage).toBeGreaterThanOrEqual(0);
      expect(status.memory.usage).toBeLessThanOrEqual(1);
      expect(typeof status.cpu.usage).toBe('number');
    });
  });

  describe('getCacheStats', () => {
    it('should return default stats when no provider', async () => {
      const stats = await service.getCacheStats();
      expect(stats.keyCount).toBe(0);
      expect(stats.hitRate).toBeUndefined();
      expect(stats.memory).toBe('0B');
    });

    it('should use provider when available', async () => {
      const provider = async () => ({
        available: true,
        keyCount: 100,
        memory: '1MB',
        hitRate: 0.909,
      });

      service = createMonitorService({
        healthCheck,
        tenantId: 'tenant-a',
        cacheStatsProvider: provider,
      });
      const stats = await service.getCacheStats();
      expect(stats.available).toBe(true);
      expect(stats.keyCount).toBe(100);
    });
  });

  describe('getDataSourceStatus', () => {
    it('should return status when no provider', async () => {
      const status = await service.getDataSourceStatus();
      // db mock is provided, SELECT 1 probe succeeds
      expect(status.connected).toBe(true);
      expect(status.metricsAvailable).toBe(false);
      expect(status.poolSize).toBe(0);
      expect(status.activeConnections).toBe(0);
      expect(status.idleConnections).toBe(0);
    });

    it('should use provider when available', async () => {
      const provider = async () => ({
        connected: true,
        metricsAvailable: true,
        poolSize: 10,
        activeConnections: 3,
        idleConnections: 7,
      });

      service = createMonitorService({
        healthCheck,
        tenantId: 'tenant-a',
        dataSourceStatsProvider: provider,
      });
      const status = await service.getDataSourceStatus();
      expect(status.connected).toBe(true);
      expect(status.poolSize).toBe(10);
      expect(status.activeConnections).toBe(3);
    });
  });

  describe('getHealthStatus', () => {
    it('should return health status', async () => {
      const health = await service.getHealthStatus();

      expect(health.status).toBe('UP');
      expect(Array.isArray(health.checks)).toBe(true);
      expect(health.checks.length).toBeGreaterThan(0);
      expect(healthCheck.ready).toHaveBeenCalled();
    });

    it('should reflect degraded status', async () => {
      (healthCheck.ready as any).mockResolvedValueOnce({
        status: 'degraded',
        checks: {
          database: { status: 'ok' },
          cache: { status: 'error', message: 'Connection refused' },
        },
        uptime: 5000,
      });

      const health = await service.getHealthStatus();
      expect(health.status).toBe('DEGRADED');
      expect(Array.isArray(health.checks)).toBe(true);
    });
  });

  describe('online users', () => {
    it('deduplicates activity by user and constrains the query to the tenant', async () => {
      const raw = mock(async (_text: string, _params?: unknown[]) => [
        {
          id: 'activity-2',
          user_id: 'user-1',
          username: 'admin',
          nickname: '管理员',
          ip: '127.0.0.1',
          browser: 'Chrome',
          os: 'macOS',
          login_at: '2026-09-14T00:00:00.000Z',
        },
      ]);
      const db = { raw } as unknown as Database;
      const multiDeviceManager = {
        getSessions: mock(() => [
          {
            sessionId: 'session-2',
            userId: 'user-1',
            deviceType: 'web',
            createdAt: Date.parse('2026-09-14T00:00:00.000Z'),
            lastActiveAt: Date.parse('2026-09-14T00:05:00.000Z'),
          },
        ]),
      } as unknown as MultiDeviceManager;
      const scoped = createMonitorService({
        healthCheck,
        db,
        tenantId: 'tenant-a',
        multiDeviceManager,
      });

      const users = await scoped.getOnlineUsers();

      expect(users).toHaveLength(1);
      expect(users[0]?.sessionId).toBe('session-2');
      expect(raw.mock.calls[0]?.[0]).toContain('DISTINCT ON (l.user_id)');
      expect(raw.mock.calls[0]?.[0]).toContain('l.tenant_id = $1');
      expect(raw.mock.calls[0]?.[1]).toEqual(['tenant-a']);
    });

    it('resolves the user from a tenant-scoped activity before force logout', async () => {
      const raw = mock(async (_text: string, _params?: unknown[]) => [{ user_id: 'user-1' }]);
      const forceLogout = mock(async () => ({ sessions: 2, devices: 1 }));
      const db = { raw } as unknown as Database;
      const authSessionManager = { forceLogout } as unknown as AuthSessionManager;
      const sessionManager = {
        get: mock(async () => ({
          id: 'session-2',
          data: { userId: 'user-1' },
          expiresAt: Date.now() + 60_000,
        })),
      } as unknown as SessionManager;
      const scoped = createMonitorService({
        healthCheck,
        db,
        tenantId: 'tenant-a',
        authSessionManager,
        sessionManager,
      });

      await scoped.forceLogout('session-2');

      expect(raw.mock.calls[0]?.[1]).toEqual(['user-1', 'tenant-a']);
      expect(forceLogout).toHaveBeenCalledWith('user-1');
    });
  });
});
