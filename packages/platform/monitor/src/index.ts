/**
 * @ventostack/monitor — 系统监控
 *
 * 运行时状态聚合：服务器状态、缓存统计、数据源状态、健康检查、在线用户。
 */

// Services
export { createMonitorService } from './services/monitor';
export type {
  OnlineUser,
  ServerStatus,
  CacheStatus,
  DataSourceStatus,
  HealthCheckItem,
  HealthStatus,
  MonitorService,
  MonitorServiceDeps,
} from './services/monitor';
export {
  calculateCpuUsage,
  collectDiskUsage,
  createSystemMetricsProvider,
} from './services/system-metrics';
export type {
  CpuSnapshot,
  CpuSnapshotItem,
  DiskUsage,
  FileSystemStats,
  SystemMetricsProvider,
} from './services/system-metrics';

// Routes
export { createMonitorRoutes } from './routes/monitor';

// Module
export { createMonitorModule } from './module';
export type { MonitorModule, MonitorModuleDeps } from './module';
