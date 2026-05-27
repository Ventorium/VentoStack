/**
 * 全局常量 — localStorage keys、API paths 等静态字符串统一管理
 */

// ==================== localStorage Keys ====================

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'user.access_token',
  REFRESH_TOKEN: 'user.refresh_token',
  REMEMBERED_USERNAME: 'user.remembered_username',
} as const

// ==================== API Paths ====================

/** 认证模块 */
export const AUTH_API = {
  LOGIN: '/api/auth/login',
  REGISTER: '/api/auth/register',
  LOGOUT: '/api/auth/logout',
  REFRESH: '/api/auth/refresh',
  FORGOT_PASSWORD: '/api/auth/forgot-password',
  RESET_PASSWORD: '/api/auth/reset-password',
  RESET_PASSWORD_BY_TOKEN: '/api/auth/reset-password-by-token',
  MFA_LOGIN: '/api/auth/mfa/login',
  MFA_ENABLE: '/api/auth/mfa/enable',
  MFA_VERIFY: '/api/auth/mfa/verify',
  MFA_DISABLE: '/api/auth/mfa/disable',
  MFA_STATUS: '/api/auth/mfa/status',
  PASSKEY_LOGIN_BEGIN: '/api/auth/passkey/login-begin',
  PASSKEY_LOGIN_FINISH: '/api/auth/passkey/login-finish',
  PASSKEY_REGISTER_BEGIN: '/api/auth/passkey/register-begin',
  PASSKEY_REGISTER_FINISH: '/api/auth/passkey/register-finish',
  PASSKEY_LIST: '/api/auth/passkey/list',
  PASSKEY_DELETE: '/api/auth/passkey/:id',
} as const

/** 系统管理模块 */
export const SYSTEM_API = {
  // 用户管理
  USERS: '/api/system/users',
  USER_DETAIL: '/api/system/users/:id',
  USER_CREATE: '/api/system/users',
  USER_UPDATE: '/api/system/users/:id',
  USER_DELETE: '/api/system/users/:id',
  USER_RESET_PWD: '/api/system/users/:id/reset-pwd',
  USER_STATUS: '/api/system/users/:id/status',
  USER_UNLOCK: '/api/system/users/:id/unlock',
  USER_BLACKLIST: '/api/system/users/:id/blacklist',
  USER_EXPORT: '/api/system/users/export',

  // 角色管理
  ROLES: '/api/system/roles',
  ROLE_DETAIL: '/api/system/roles/:id',
  ROLE_CREATE: '/api/system/roles',
  ROLE_UPDATE: '/api/system/roles/:id',
  ROLE_DELETE: '/api/system/roles/:id',
  ROLE_MENUS: '/api/system/roles/:id/menus',
  ROLE_DATA_SCOPE: '/api/system/roles/:id/data-scope',

  // 菜单管理
  MENUS: '/api/system/menus',
  MENU_DETAIL: '/api/system/menus/:id',
  MENU_CREATE: '/api/system/menus',
  MENU_UPDATE: '/api/system/menus/:id',
  MENU_DELETE: '/api/system/menus/:id',
  MENU_TREE: '/api/system/menus/tree',

  // 部门管理
  DEPTS: '/api/system/depts',
  DEPT_DETAIL: '/api/system/depts/:id',
  DEPT_CREATE: '/api/system/depts',
  DEPT_UPDATE: '/api/system/depts/:id',
  DEPT_DELETE: '/api/system/depts/:id',
  DEPT_TREE: '/api/system/depts/tree',

  // 岗位管理
  POSTS: '/api/system/posts',
  POST_DETAIL: '/api/system/posts/:id',
  POST_CREATE: '/api/system/posts',
  POST_UPDATE: '/api/system/posts/:id',
  POST_DELETE: '/api/system/posts/:id',

  // 字典管理
  DICT_TYPES: '/api/system/dict/types',
  DICT_TYPE_DETAIL: '/api/system/dict/types/:id',
  DICT_TYPE_CREATE: '/api/system/dict/types',
  DICT_TYPE_UPDATE: '/api/system/dict/types/:id',
  DICT_TYPE_DELETE: '/api/system/dict/types/:id',
  DICT_DATA_BY_CODE: '/api/system/dict/types/:code/data',
  DICT_DATA_CREATE: '/api/system/dict/data',
  DICT_DATA_UPDATE: '/api/system/dict/data/:id',
  DICT_DATA_DELETE: '/api/system/dict/data/:id',

  // 参数配置
  CONFIGS: '/api/system/configs',
  CONFIG_DETAIL: '/api/system/configs/:id',
  CONFIG_CREATE: '/api/system/configs',
  CONFIG_UPDATE: '/api/system/configs/:id',
  CONFIG_DELETE: '/api/system/configs/:id',
  CONFIG_BY_KEY: '/api/system/configs/by-key/:key',
  CONFIGS_PUBLIC: '/api/system/configs/public',

  // 通知公告
  NOTICES: '/api/system/notices',
  NOTICE_DETAIL: '/api/system/notices/:id',
  NOTICE_CREATE: '/api/system/notices',
  NOTICE_UPDATE: '/api/system/notices/:id',
  NOTICE_DELETE: '/api/system/notices/:id',
  NOTICE_PUBLISH: '/api/system/notices/:id/publish',
  NOTICE_REVOKE: '/api/system/notices/:id/revoke',
  NOTICE_READ: '/api/system/notices/:id/read',

  // 用户自助
  USER_PROFILE: '/api/system/user/profile',
  USER_PROFILE_UPDATE: '/api/system/user/profile',
  USER_PROFILE_PASSWORD: '/api/system/user/profile/password',
  USER_PROFILE_AVATAR: '/api/system/user/profile/avatar',
  USER_ROUTES: '/api/system/user/routes',
  USER_PERMISSIONS: '/api/system/user/permissions',

  // 日志
  OPERATION_LOGS: '/api/system/operation-logs',
  LOGIN_LOGS: '/api/system/login-logs',
  LOGIN_LOG_CLEAR: '/api/system/login-logs',

  // 仪表盘
  DASHBOARD_STATS: '/api/system/dashboard/stats',

  // 在线用户
  ONLINE_USERS: '/api/system/monitor/online',
  ONLINE_USER_KICK: '/api/system/monitor/online/:sessionId',

  // 服务监控
  MONITOR_SERVER: '/api/system/monitor/server',
  MONITOR_CACHE: '/api/system/monitor/cache',
  MONITOR_DATASOURCE: '/api/system/monitor/datasource',
  MONITOR_HEALTH: '/api/system/monitor/health',
} as const

/** 代码生成模块 */
export const GEN_API = {
  TABLES: '/api/system/gen/tables',
  TABLE_DETAIL: '/api/system/gen/tables/:id',
  TABLE_UPDATE: '/api/system/gen/tables/:id',
  TABLE_IMPORT: '/api/system/gen/tables/import',
  TABLE_PREVIEW: '/api/system/gen/tables/:id/preview',
  TABLE_GENERATE: '/api/system/gen/tables/:id/generate',
  COLUMN_UPDATE: '/api/system/gen/columns/:id',
  DB_TABLES: '/api/system/gen/db-tables',
} as const

/** 文件存储模块 */
export const OSS_API = {
  LIST: '/api/system/oss',
  DETAIL: '/api/system/oss/:id',
  UPLOAD: '/api/system/oss/upload',
  DOWNLOAD: '/api/system/oss/:id/download',
  SIGNED_URL: '/api/system/oss/:id/url',
  DELETE: '/api/system/oss/:id',
} as const

/** 定时任务模块 */
export const SCHEDULER_API = {
  JOBS: '/api/system/scheduler/jobs',
  JOB_DETAIL: '/api/system/scheduler/jobs/:id',
  JOB_CREATE: '/api/system/scheduler/jobs',
  JOB_UPDATE: '/api/system/scheduler/jobs/:id',
  JOB_DELETE: '/api/system/scheduler/jobs/:id',
  JOB_START: '/api/system/scheduler/jobs/:id/start',
  JOB_STOP: '/api/system/scheduler/jobs/:id/stop',
  JOB_EXECUTE: '/api/system/scheduler/jobs/:id/execute',
  LOGS: '/api/system/scheduler/logs',
} as const

/** 消息通知模块 */
export const NOTIFICATION_API = {
  MESSAGES: '/api/system/notification/messages',
  UNREAD_COUNT: '/api/system/notification/messages/unread-count',
  MESSAGE_READ: '/api/system/notification/messages/:id/read',
  MESSAGE_READ_BATCH: '/api/system/notification/messages/read-batch',
  MESSAGE_RETRY: '/api/system/notification/messages/:id/retry',
  TEMPLATES: '/api/system/notification/templates',
  TEMPLATE_CREATE: '/api/system/notification/templates',
  TEMPLATE_UPDATE: '/api/system/notification/templates/:id',
  TEMPLATE_DELETE: '/api/system/notification/templates/:id',
  SEND: '/api/system/notification/send',
} as const
