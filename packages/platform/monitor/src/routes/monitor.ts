/**
 * @ventostack/monitor - 监控路由
 */

import { createRouter, success } from '@ventostack/core';
import type { Middleware, Router } from '@ventostack/core';
import type { MonitorService } from '../services/monitor';

export function createMonitorRoutes(
  monitorService: MonitorService,
  authMiddleware: Middleware,
  perm: (resource: string, action: string) => Middleware,
): Router {
  const router = createRouter();
  router.use(authMiddleware);

  // 服务器状态
  router.get(
    '/api/system/monitor/server',
    {
      responses: {
        200: {
          cpu: { type: 'object' as const, description: 'CPU 信息' },
          memory: { type: 'object' as const, description: '内存信息' },
          disk: { type: 'object' as const, description: '磁盘信息' },
          os: { type: 'object' as const, description: '操作系统信息' },
          process: { type: 'object' as const, description: '进程信息' },
        },
      },
      openapi: { summary: '获取服务器状态', tags: ['monitor'], operationId: 'getServerStatus' },
    },
    async () => {
      const status = await monitorService.getServerStatus();
      return success(status);
    },
    perm('system:monitor', 'list'),
  );

  // 缓存统计
  router.get(
    '/api/system/monitor/cache',
    {
      responses: {
        200: {
          available: { type: 'boolean' as const, description: '是否已配置真实缓存统计采集器' },
          keyCount: { type: 'int' as const, description: 'Key 总数' },
          memory: { type: 'string' as const, description: '内存使用' },
        },
      },
      openapi: { summary: '获取缓存统计', tags: ['monitor'], operationId: 'getCacheStats' },
    },
    async () => {
      const stats = await monitorService.getCacheStats();
      return success(stats);
    },
    perm('system:monitor', 'list'),
  );

  // 数据源状态
  router.get(
    '/api/system/monitor/datasource',
    {
      responses: {
        200: {
          connected: { type: 'boolean' as const, description: '是否连接' },
          metricsAvailable: {
            type: 'boolean' as const,
            description: '是否可以读取真实连接池统计',
          },
          poolSize: { type: 'int' as const, description: '连接池大小' },
          activeConnections: { type: 'int' as const, description: '活跃连接数' },
          idleConnections: { type: 'int' as const, description: '空闲连接数' },
        },
      },
      openapi: { summary: '获取数据源状态', tags: ['monitor'], operationId: 'getDataSourceStatus' },
    },
    async () => {
      const status = await monitorService.getDataSourceStatus();
      return success(status);
    },
    perm('system:monitor', 'list'),
  );

  // 健康检查
  router.get(
    '/api/system/monitor/health',
    {
      responses: {
        200: {
          status: { type: 'string' as const, description: '健康状态' },
          checks: { type: 'array' as const, description: '各项检查结果' },
        },
      },
      openapi: { summary: '健康检查', tags: ['monitor'], operationId: 'getHealthStatus' },
    },
    async () => {
      const health = await monitorService.getHealthStatus();
      return success(health);
    },
    perm('system:monitor', 'list'),
  );

  // 最近活动用户列表
  router.get(
    '/api/system/monitor/online',
    {
      responses: {
        200: {
          list: {
            type: 'array' as const,
            items: { type: 'object' as const },
            description: '当前租户最近 30 分钟活动用户列表（按用户去重）',
          },
          total: { type: 'int' as const, description: '总数' },
        },
      },
      openapi: {
        summary: '获取最近活动用户',
        description: '租户范围来自认证上下文；客户端不得提交 tenantId。',
        tags: ['monitor'],
        operationId: 'getOnlineUsers',
      },
    },
    async () => {
      const users = await monitorService.getOnlineUsers();
      // 响应 schema 声明为 {list, total}，此处显式包装与契约一致
      return success({ list: users, total: users.length });
    },
    perm('system:online', 'list'),
  );

  // 强制下线
  router.delete(
    '/api/system/monitor/online/:sessionId',
    {
      openapi: {
        summary: '强制下线',
        description: '校验当前租户内的有效会话，并撤销该用户的全部会话。',
        tags: ['monitor'],
        operationId: 'forceLogout',
      },
    },
    async (ctx) => {
      const sessionId = (ctx.params as Record<string, string>).sessionId!;
      await monitorService.forceLogout(sessionId);
      return success(null);
    },
    perm('system:online', 'forceLogout'),
  );

  return router;
}
