/**
 * 后端共享类型
 */

/** 运行环境 */
export type Environment = "development" | "production" | "test";

/** 日志级别 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 分页参数 */
export interface PageParams {
  page: number;
  pageSize: number;
}

/** 应用上下文（请求级） */
export interface RequestContext {
  requestId: string;
  startTime: number;
}
