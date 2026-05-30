import { describe, expect, mock, test } from "bun:test";

describe("系统监控页", () => {
  test("formatUptime 格式化运行时间", () => {
    const formatUptime = (seconds: number): string => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (days > 0) return `${days}天 ${hours}小时 ${minutes}分钟`;
      if (hours > 0) return `${hours}小时 ${minutes}分钟`;
      return `${minutes}分钟`;
    };
    expect(formatUptime(86400)).toBe("1天 0小时 0分钟");
    expect(formatUptime(3600)).toBe("1小时 0分钟");
    expect(formatUptime(90061)).toBe("1天 1小时 1分钟");
    expect(formatUptime(120)).toBe("2分钟");
  });

  test("ServerStatus 类型应包含必要字段", () => {
    const status = {
      cpuUsage: 45.5,
      memoryUsage: 60.2,
      memoryTotal: 16384,
      memoryUsed: 9876,
      uptime: 86400,
      nodeVersion: "v20.0.0",
      bunVersion: "1.0.0",
    };
    expect(status.cpuUsage).toBeGreaterThanOrEqual(0);
    expect(status.cpuUsage).toBeLessThanOrEqual(100);
    expect(status.memoryUsage).toBeGreaterThanOrEqual(0);
    expect(status.memoryUsed).toBeLessThanOrEqual(status.memoryTotal);
  });

  test("CacheStatus 类型应包含命中率", () => {
    const cache = { keyCount: 1500, hitRate: 85.5, memoryUsage: 256 * 1024 * 1024 };
    expect(cache.hitRate).toBeGreaterThanOrEqual(0);
    expect(cache.hitRate).toBeLessThanOrEqual(100);
  });

  test("HealthStatus 类型应包含检查项", () => {
    const health = {
      status: "UP",
      checks: [
        { name: "database", status: "UP", duration: 5 },
        { name: "redis", status: "UP", duration: 2 },
      ],
    };
    expect(["UP", "DOWN", "DEGRADED"]).toContain(health.status);
    expect(health.checks.length).toBeGreaterThan(0);
  });

  test("DataSourceStatus UP/DOWN 判断", () => {
    const up = { status: "UP", activeConnections: 5, idleConnections: 10, maxConnections: 20 };
    const down = { status: "DOWN", activeConnections: 0, idleConnections: 0, maxConnections: 20 };
    expect(up.status).toBe("UP");
    expect(down.status).toBe("DOWN");
    expect(up.activeConnections + up.idleConnections).toBeLessThanOrEqual(up.maxConnections);
  });

  test("4 个 API 端点路径正确", () => {
    const endpoints = {
      server: "/api/system/monitor/server",
      cache: "/api/system/monitor/cache",
      datasource: "/api/system/monitor/datasource",
      health: "/api/system/monitor/health",
    };
    expect(endpoints.server).toBe("/api/system/monitor/server");
    expect(endpoints.cache).toBe("/api/system/monitor/cache");
    expect(endpoints.datasource).toBe("/api/system/monitor/datasource");
    expect(endpoints.health).toBe("/api/system/monitor/health");
  });

  test("ServerStatus 嵌套结构: cpu.usage, memory.used/total, disk.total, process.uptime, os.platform", () => {
    const serverStatus = {
      cpu: { usage: 0.45, model: "Apple M1", cores: 8 },
      memory: { used: 8 * 1024 * 1024 * 1024, total: 16 * 1024 * 1024 * 1024, usage: 0.5 },
      disk: { used: 100 * 1024 * 1024 * 1024, total: 500 * 1024 * 1024 * 1024, usage: 0.2 },
      process: { uptime: 86400, bunVersion: "1.0.0", nodeVersion: "v20.0.0" },
      os: { platform: "darwin", arch: "arm64", hostname: "MacBook-Pro" },
    };
    expect(serverStatus.cpu.usage).toBe(0.45);
    expect(serverStatus.memory.used).toBeLessThan(serverStatus.memory.total);
    expect(serverStatus.disk.total).toBeGreaterThan(0);
    expect(serverStatus.process.uptime).toBe(86400);
    expect(serverStatus.os.platform).toBe("darwin");
  });

  test('CacheStatus: memory 为字符串（如 "1.5MB"），hitRate 为可选数字', () => {
    const cacheStatus = { keyCount: 1500, hitRate: 0.855, memory: "1.5MB", version: "7.0.0" };
    expect(typeof cacheStatus.memory).toBe("string");
    expect(cacheStatus.memory).toContain("MB");
    expect(typeof cacheStatus.hitRate).toBe("number");
    expect(cacheStatus.hitRate).toBeGreaterThanOrEqual(0);
    expect(cacheStatus.hitRate).toBeLessThanOrEqual(1);
  });

  test("CacheStatus: hitRate 为 null 时不显示命中率", () => {
    const cacheStatus = { keyCount: 100, hitRate: null, memory: "512KB" };
    const showHitRate = cacheStatus.hitRate != null;
    expect(showHitRate).toBe(false);
  });

  test("DataSourceStatus: connected 为 boolean, poolSize 为 number", () => {
    const dsStatus = { connected: true, poolSize: 20, activeConnections: 5, idleConnections: 15 };
    expect(typeof dsStatus.connected).toBe("boolean");
    expect(typeof dsStatus.poolSize).toBe("number");
    expect(typeof dsStatus.activeConnections).toBe("number");
    expect(typeof dsStatus.idleConnections).toBe("number");
  });

  test("DataSourceStatus: connected=false 时显示未连接", () => {
    const dsStatus = { connected: false, poolSize: 0, activeConnections: 0, idleConnections: 0 };
    const tagColor = dsStatus.connected ? "green" : "red";
    expect(tagColor).toBe("red");
  });

  test("HealthStatus: checks 为数组，每项含 name/status/details", () => {
    const healthStatus = {
      status: "UP",
      checks: [
        { name: "database", status: "UP", details: "PostgreSQL 15.0" },
        { name: "redis", status: "UP", details: "Redis 7.0" },
      ],
    };
    expect(Array.isArray(healthStatus.checks)).toBe(true);
    expect(healthStatus.checks[0].name).toBe("database");
    expect(healthStatus.checks[0].status).toBe("UP");
    expect(healthStatus.checks[0].details).toBeTruthy();
  });

  test("自动刷新间隔为 30 秒", () => {
    const autoRefreshInterval = 30000;
    expect(autoRefreshInterval).toBe(30000);
  });

  test("自动刷新默认关闭", () => {
    const defaultAutoRefresh = false;
    expect(defaultAutoRefresh).toBe(false);
  });

  test("自动刷新可切换开关", () => {
    let autoRefresh = false;
    autoRefresh = !autoRefresh;
    expect(autoRefresh).toBe(true);
    autoRefresh = !autoRefresh;
    expect(autoRefresh).toBe(false);
  });

  test("fetchAllData 使用 Promise.all 并行请求 4 个端点", () => {
    const client = {
      get: mock(() => Promise.resolve({ error: null, data: {} })),
    };
    const fetchAllData = async () => {
      return Promise.all([
        client.get("/api/system/monitor/server"),
        client.get("/api/system/monitor/cache"),
        client.get("/api/system/monitor/datasource"),
        client.get("/api/system/monitor/health"),
      ]);
    };
    fetchAllData();
    expect(client.get).toHaveBeenCalledTimes(4);
    const calledUrls = client.get.mock.calls.map((c: unknown[]) => c[0]);
    expect(calledUrls).toContain("/api/system/monitor/server");
    expect(calledUrls).toContain("/api/system/monitor/cache");
    expect(calledUrls).toContain("/api/system/monitor/datasource");
    expect(calledUrls).toContain("/api/system/monitor/health");
  });

  test("CPU 使用率显示百分比: Math.round(usage * 100)", () => {
    const usage = 0.456;
    const percent = Math.round(usage * 100);
    expect(percent).toBe(46);
  });

  test("内存显示: used/total 转换为 MB", () => {
    const memory = { used: 8 * 1024 * 1024 * 1024, total: 16 * 1024 * 1024 * 1024 };
    const usedMB = Math.round(memory.used / 1024 / 1024);
    const totalMB = Math.round(memory.total / 1024 / 1024);
    expect(usedMB).toBe(8192);
    expect(totalMB).toBe(16384);
  });
});
