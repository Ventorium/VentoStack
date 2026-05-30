/**
 * @ventostack/monitor - 监控服务测试
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { createMonitorService } from "../services/monitor";
import { createMockDatabase, createMockExecutor, createMockHealthCheck } from "./helpers";

describe("MonitorService", () => {
  let healthCheck: ReturnType<typeof createMockHealthCheck>;
  let service: ReturnType<typeof createMonitorService>;

  beforeEach(() => {
    healthCheck = createMockHealthCheck();
    const mockExec = createMockExecutor();
    const { db } = createMockDatabase(mockExec);
    service = createMonitorService({ healthCheck, db });
  });

  describe("getServerStatus", () => {
    it("should return server status", async () => {
      const status = await service.getServerStatus();

      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.memoryTotal).toBeGreaterThanOrEqual(0);
      expect(status.memoryUsed).toBeGreaterThanOrEqual(0);
      expect(status.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(status.memoryUsage).toBeLessThanOrEqual(1);
      expect(typeof status.cpuUsage).toBe("number");
    });
  });

  describe("getCacheStats", () => {
    it("should return default stats when no provider", async () => {
      const stats = await service.getCacheStats();
      expect(stats.keyCount).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it("should use provider when available", async () => {
      const provider = async () => ({
        connected: true,
        hits: 100,
        misses: 10,
        hitRate: 90.9,
      });

      service = createMonitorService({ healthCheck, cacheStatsProvider: provider });
      const stats = await service.getCacheStats();
      expect(stats.connected).toBe(true);
      expect(stats.hits).toBe(100);
    });
  });

  describe("getDataSourceStatus", () => {
    it("should return status when no provider", async () => {
      const status = await service.getDataSourceStatus();
      expect(["UP", "DOWN", "UNKNOWN"]).toContain(status.status);
    });

    it("should use provider when available", async () => {
      const provider = async () => ({
        connected: true,
        poolSize: 10,
        activeConnections: 3,
        idleConnections: 7,
        waitingCount: 0,
      });

      service = createMonitorService({ healthCheck, dataSourceStatsProvider: provider });
      const status = await service.getDataSourceStatus();
      expect(status.connected).toBe(true);
      expect(status.poolSize).toBe(10);
      expect(status.activeConnections).toBe(3);
    });
  });

  describe("getHealthStatus", () => {
    it("should return health status", async () => {
      const health = await service.getHealthStatus();

      expect(health.status).toBe("UP");
      expect(Array.isArray(health.checks)).toBe(true);
      expect(health.checks.length).toBeGreaterThan(0);
      expect(healthCheck.ready).toHaveBeenCalled();
    });

    it("should reflect degraded status", async () => {
      (healthCheck.ready as any).mockResolvedValueOnce({
        status: "degraded",
        checks: {
          database: { status: "ok" },
          cache: { status: "error", message: "Connection refused" },
        },
        uptime: 5000,
      });

      const health = await service.getHealthStatus();
      expect(health.status).toBe("DEGRADED");
      expect(Array.isArray(health.checks)).toBe(true);
    });
  });
});
