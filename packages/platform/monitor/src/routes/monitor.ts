/**
 * @ventostack/monitor - 监控路由
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router, RouteSchemaConfig } from "@ventostack/core";
import type { MonitorService } from "../services/monitor";
import { ok, fail } from "./common";

export function createMonitorRoutes(
  monitorService: MonitorService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 服务器状态
  router.get("/api/system/monitor/server", {
    responses: {
      200: {
        cpu: { type: "object" as const, description: "CPU 信息" },
        memory: { type: "object" as const, description: "内存信息" },
        disk: { type: "object" as const, description: "磁盘信息" },
        os: { type: "object" as const, description: "操作系统信息" },
        process: { type: "object" as const, description: "进程信息" },
      },
    },
    openapi: { summary: "获取服务器状态", tags: ["monitor"], operationId: "getServerStatus" },
  }, async () => {
    const status = await monitorService.getServerStatus();
    return ok(status);
  }, perm("system", "monitor:list"));

  // 缓存统计
  router.get("/api/system/monitor/cache", {
    responses: {
      200: {
        info: { type: "object" as const, description: "Redis 信息" },
        keyCount: { type: "int" as const, description: "Key 总数" },
        memory: { type: "string" as const, description: "内存使用" },
      },
    },
    openapi: { summary: "获取缓存统计", tags: ["monitor"], operationId: "getCacheStats" },
  }, async () => {
    const stats = await monitorService.getCacheStats();
    return ok(stats);
  }, perm("system", "monitor:list"));

  // 数据源状态
  router.get("/api/system/monitor/datasource", {
    responses: {
      200: {
        connected: { type: "boolean" as const, description: "是否连接" },
        poolSize: { type: "int" as const, description: "连接池大小" },
        activeConnections: { type: "int" as const, description: "活跃连接数" },
        idleConnections: { type: "int" as const, description: "空闲连接数" },
      },
    },
    openapi: { summary: "获取数据源状态", tags: ["monitor"], operationId: "getDataSourceStatus" },
  }, async () => {
    const status = await monitorService.getDataSourceStatus();
    return ok(status);
  }, perm("system", "monitor:list"));

  // 健康检查
  router.get("/api/system/monitor/health", {
    responses: {
      200: {
        status: { type: "string" as const, description: "健康状态" },
        checks: { type: "array" as const, description: "各项检查结果" },
      },
    },
    openapi: { summary: "健康检查", tags: ["monitor"], operationId: "getHealthStatus" },
  }, async () => {
    const health = await monitorService.getHealthStatus();
    return ok(health);
  }, perm("system", "monitor:list"));

  // 在线用户列表
  router.get("/api/system/monitor/online", {
    query: {
      page: { type: "int" as const, default: 1, description: "页码" },
      pageSize: { type: "int" as const, default: 10, description: "每页数量" },
    },
    responses: {
      200: {
        list: { type: "array" as const, description: "在线用户列表" },
        total: { type: "int" as const, description: "总数" },
      },
    },
    openapi: { summary: "获取在线用户", tags: ["monitor"], operationId: "getOnlineUsers" },
  }, async () => {
    const users = await monitorService.getOnlineUsers();
    return ok(users);
  }, perm("system", "online:list"));

  // 强制下线
  router.delete("/api/system/monitor/online/:sessionId", {
    query: {
      userId: { type: "uuid" as const, description: "用户 ID" },
    },
    openapi: { summary: "强制下线", tags: ["monitor"], operationId: "forceLogout" },
  }, async (ctx) => {
    const sessionId = (ctx.params as Record<string, string>).sessionId!;
    const userId = ctx.query?.userId as string | undefined;
    await monitorService.forceLogout(sessionId, userId ?? "");
    return ok(null);
  }, perm("system", "online:forceLogout"));

  return router;
}
