/**
 * 全局常量 — localStorage keys 与业务 API paths
 */

// ==================== localStorage Keys ====================

export const STORAGE_KEYS = {
  ACCESS_TOKEN: "user.access_token",
  REFRESH_TOKEN: "user.refresh_token",
  REMEMBERED_USERNAME: "user.remembered_username",
} as const;

// ==================== API Paths ====================
// 仅保留实际被引用的模块常量。
// AUTH_API / SYSTEM_API 已由 OpenAPI 自动生成的 schema.ts 覆盖，不再重复定义。

/** 文件存储模块 */
export const OSS_API = {
  LIST: "/api/system/oss",
  DETAIL: "/api/system/oss/:id",
  UPLOAD: "/api/system/oss/upload",
  DOWNLOAD: "/api/system/oss/:id/download",
  SIGNED_URL: "/api/system/oss/:id/url",
  DELETE: "/api/system/oss/:id",
} as const;

/** 定时任务模块 */
export const SCHEDULER_API = {
  JOBS: "/api/system/scheduler/jobs",
  JOB_DETAIL: "/api/system/scheduler/jobs/:id",
  JOB_CREATE: "/api/system/scheduler/jobs",
  JOB_UPDATE: "/api/system/scheduler/jobs/:id",
  JOB_DELETE: "/api/system/scheduler/jobs/:id",
  JOB_START: "/api/system/scheduler/jobs/:id/start",
  JOB_STOP: "/api/system/scheduler/jobs/:id/stop",
  JOB_EXECUTE: "/api/system/scheduler/jobs/:id/execute",
  LOGS: "/api/system/scheduler/logs",
} as const;

/** 消息通知模块 */
export const NOTIFICATION_API = {
  MESSAGES: "/api/system/notification/messages",
  UNREAD_COUNT: "/api/system/notification/messages/unread-count",
  MESSAGE_READ: "/api/system/notification/messages/:id/read",
  MESSAGE_READ_BATCH: "/api/system/notification/messages/read-batch",
  MESSAGE_RETRY: "/api/system/notification/messages/:id/retry",
  TEMPLATES: "/api/system/notification/templates",
  TEMPLATE_CREATE: "/api/system/notification/templates",
  TEMPLATE_UPDATE: "/api/system/notification/templates/:id",
  TEMPLATE_DELETE: "/api/system/notification/templates/:id",
  SEND: "/api/system/notification/send",
} as const;
