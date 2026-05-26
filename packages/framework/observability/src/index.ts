/**
 * @ventostack/observability - 可观测性模块统一导出
 *
 * 提供 VentoStack 框架的完整可观测性基础设施，包括：
 * - 结构化日志记录器（createLogger）
 * - Prometheus 兼容指标收集器（createMetrics）
 * - 健康检查服务（createHealthCheck）
 * - 分布式追踪器（createTracer）
 * - 文件日志与轮转（createFileLogger）
 * - 防篡改审计日志（createAuditLog）
 * - W3C TraceContext / B3 传播器（createW3CTraceContextPropagator / createB3Propagator）
 * - 审计日志导出与分页查询（createAuditExporter）
 * - 异步批量写入器（createAsyncWriter）
 * - 远端日志系统钩子（createLogHook）
 * - OpenTelemetry 兼容追踪器（createOTelTracer / createConsoleExporter）
 * - 链路追踪导出器（createTraceExporter）
 * - Grafana Dashboard 模板生成（createGrafanaDashboard / createHttpDashboard）
 * - 错误上报与多通道告警（createErrorReporter / createSentryChannel / createDingTalkChannel / createWebhookChannel）
 *
 * 所有组件默认支持关闭（no-op），关闭时不产生副作用。
 */

/** 创建结构化日志记录器 */
export { createLogger, getDefaultLogger } from "./logger";
export type { Logger, LogLevel, LogEntry, LoggerOptions } from "./logger";

/** 创建指标收集器（计数器、直方图、仪表盘） */
export { createMetrics } from "./metrics";
export type {
  Metrics,
  Counter,
  Histogram,
  HistogramSnapshot,
  MetricsOptions,
  Gauge,
} from "./metrics";

/** 创建健康检查服务 */
export { createHealthCheck, createDefaultHealthCheck, sqlCheck, redisCheck } from "./health";
export type {
  HealthCheck,
  HealthStatus,
  HealthCheckOptions,
  CheckResult,
  SqlCheckable,
  RedisCheckable,
  DefaultHealthCheckOptions,
} from "./health";

/** 创建分布式追踪器 */
export { createTracer } from "./tracing";
export type { Tracer, Span, SpanContext, SpanHandle } from "./tracing";

/** 创建文件日志记录器 */
export { createFileLogger } from "./file-logger";
export type { FileLogger, FileLoggerOptions } from "./file-logger";

/** 创建审计日志 */
export { createAuditLog } from "./audit";
export type { AuditEntry, AuditStore } from "./audit";

/** 创建 W3C TraceContext 与 B3 传播器 */
export { createW3CTraceContextPropagator, createB3Propagator } from "./trace-context";
export type { TraceContextPropagator } from "./trace-context";

/** 创建审计日志导出器 */
export { createAuditExporter } from "./audit-export";
export type { AuditExporter } from "./audit-export";

/** 创建异步批量写入器 */
export { createAsyncWriter } from "./async-writer";
export type { AsyncWriter, AsyncWriterOptions } from "./async-writer";

/** 创建日志拦截钩子 */
export { createLogHook } from "./log-hook";
export type { LogHook, LogHookConfig, LogEntry as LogHookEntry } from "./log-hook";

/** 创建 OpenTelemetry 兼容追踪器与控制台导出器 */
export { createTracer as createOTelTracer, createConsoleExporter } from "./otel";
export type { OTelSpan, OTelConfig, SpanExporter, Tracer as OTelTracer } from "./otel";

/** 创建链路追踪导出器 */
export { createTraceExporter } from "./trace-exporter";
export type { TraceExporterConfig } from "./trace-exporter";

/** 创建请求追踪中间件 */
export { createTracingMiddleware } from "./tracing-middleware";
export type { TracingMiddlewareOptions } from "./tracing-middleware";

/** SQL Executor 追踪包装器 */
export { wrapExecutorWithTracing } from "./tracing-executor";
export type { ExecutorTracingOptions, SqlExecutor as TraceableSqlExecutor } from "./tracing-executor";

/** Cache 追踪包装器 */
export { wrapCacheWithTracing } from "./cache-tracing";
export type { CacheTracingOptions } from "./cache-tracing";

/** Redis Client 追踪包装器 */
export { wrapRedisClientWithTracing } from "./redis-tracing";
export type { RedisTracingOptions } from "./redis-tracing";

/** 创建 Grafana Dashboard JSON 模板 */
export { createGrafanaDashboard, createHttpDashboard } from "./grafana";
export type { GrafanaDashboard, GrafanaDashboardConfig, GrafanaPanelConfig } from "./grafana";

/** 创建错误报告器与多种告警通道 */
export {
  createErrorReporter,
  createSentryChannel,
  createDingTalkChannel,
  createWebhookChannel,
} from "./error-reporter";
export type {
  ErrorReporter,
  ErrorReporterConfig,
  ErrorChannel,
  ErrorReport,
} from "./error-reporter";
