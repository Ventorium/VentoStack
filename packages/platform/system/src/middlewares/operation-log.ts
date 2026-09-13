/**
 * @ventostack/system - 操作日志中间件
 * 记录写操作的审计日志，自动脱敏敏感字段，异步写入不阻塞响应
 * 同时写入内存审计链和数据库持久化表
 */

import type { Middleware } from '@ventostack/core';
import { isSensitiveFieldName } from '@ventostack/observability';
import type { AuditStore } from '@ventostack/observability';
import { describeIPLocation } from '../services/ip-location';

const OPERATION_LOG_ACTIVE = Symbol('operationLogActive');

/** 操作日志中间件配置 */
export interface OperationLogOptions {
  /** 排除的路径前缀列表（不记录日志） */
  excludePaths?: string[];
  /** 排除的路径前缀列表（用于匹配以该前缀开头的路径） */
  excludePathPrefixes?: string[];
  /** 需要脱敏的字段名（不区分大小写） */
  sensitiveFields?: string[];
  /** 将日志写入数据库的函数 */
  saveToDb?: (entry: OperationLogEntry) => Promise<void>;
  /**
   * 可信代理 IP/CIDR 列表。
   * 当请求来自这些地址时，才读取 X-Forwarded-For / X-Real-IP 头获取真实客户端 IP。
   * 默认空数组，表示不信任任何代理头（直接从连接获取 IP）。
   */
  trustedProxies?: string[];
}

/** 写入数据库的操作日志条目 */
export interface OperationLogEntry {
  id: string;
  user_id: string | null;
  username: string;
  module: string;
  action: string;
  method: string;
  url: string;
  ip: string;
  location: string;
  params: string | null;
  result: number;
  error_msg: string | null;
  duration: number;
  created_at: Date;
}

/** 默认需要脱敏的字段 */
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'secret',
  'key',
  'value',
  'cookie',
  'authorization',
  'phone',
  'email',
  'idcard',
  'mfaSecret',
  'mfa_secret',
  'creditcard',
  'ssn',
  'apikey',
  'access_token',
  'refresh_token',
  'private_key',
  'connection_string',
  'database_url',
  'sessionid',
  'session_id',
  'resettoken',
  'reset_token',
  'temptoken',
  'temp_token',
  'mfarecovery',
  'mfa_recovery',
  'refreshtoken',
  'refresh_token_jti',
];

/** URL 路径前缀 → 模块中文名映射 */
const MODULE_MAP: Array<{ prefix: string; name: string }> = [
  { prefix: '/api/system/users', name: '用户管理' },
  { prefix: '/api/system/roles', name: '角色管理' },
  { prefix: '/api/system/menus', name: '菜单管理' },
  { prefix: '/api/system/depts', name: '部门管理' },
  { prefix: '/api/system/posts', name: '岗位管理' },
  { prefix: '/api/system/dict', name: '字典管理' },
  { prefix: '/api/system/configs', name: '参数配置' },
  { prefix: '/api/system/notices', name: '通知公告' },
  { prefix: '/api/system/login-logs', name: '登录日志' },
  { prefix: '/api/system/operation-logs', name: '操作日志' },
  { prefix: '/api/system/monitor', name: '系统监控' },
  { prefix: '/api/system/user', name: '个人中心' },
  { prefix: '/api/auth', name: '认证管理' },
  { prefix: '/api/system/scheduler', name: '定时任务' },
  { prefix: '/api/system/oss', name: '文件管理' },
  { prefix: '/api/system/gen', name: '代码生成' },
  { prefix: '/api/system/notification', name: '消息通知' },
  { prefix: '/api/system/tags', name: '标签管理' },
  { prefix: '/api/i18n', name: '国际化管理' },
  { prefix: '/api/workflow', name: '工作流管理' },
  { prefix: '/api/ai/trace', name: 'AI链路配置' },
];

/**
 * 根据 URL 路径推断模块名称
 * 匹配最长前缀，未匹配则返回 "其他"
 */
function resolveModule(path: string): string {
  let matched = '';
  let moduleName = '其他';
  for (const entry of MODULE_MAP) {
    if (path.startsWith(entry.prefix) && entry.prefix.length > matched.length) {
      matched = entry.prefix;
      moduleName = entry.name;
    }
  }
  return moduleName;
}

/**
 * 规范化 URL 路径：将 UUID 和数字 ID 替换为 :id
 */
function normalizePath(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/**
 * `{METHOD} {normalizedPath}` → 业务操作描述
 * 未匹配时回退到 `{method} {path}`
 */
const ACTION_DESCRIPTIONS: Record<string, string> = {
  // ── 认证 ──
  'POST /api/auth/login': '登录',
  'POST /api/auth/register': '注册',
  'POST /api/auth/refresh': '刷新令牌',
  'POST /api/auth/logout': '退出登录',
  'POST /api/auth/forgot-password': '申请找回密码',
  'POST /api/auth/reset-password': '重置密码',
  'POST /api/auth/reset-password-by-token': '通过令牌重置密码',
  'POST /api/auth/mfa/login': '多因素认证登录',
  'POST /api/auth/mfa/enable': '启用MFA',
  'POST /api/auth/mfa/verify': '验证MFA',
  'POST /api/auth/mfa/disable': '禁用MFA',
  'POST /api/auth/passkey/login-begin': '开始通行密钥登录',
  'POST /api/auth/passkey/login-finish': '完成通行密钥登录',
  'POST /api/auth/passkey/register-begin': '开始注册通行密钥',
  'POST /api/auth/passkey/register-finish': '完成注册通行密钥',
  'DELETE /api/auth/passkey/:id': '删除通行密钥',
  'PUT /api/auth/password': '修改密码',
  'PUT /api/auth/profile': '更新资料',

  // ── 用户管理 ──
  'POST /api/system/users': '新增用户',
  'PUT /api/system/users/:id': '编辑用户',
  'DELETE /api/system/users/:id': '删除用户',
  'PUT /api/system/users/:id/reset-pwd': '重置密码',
  'PUT /api/system/users/:id/status': '更新状态',
  'PUT /api/system/users/:id/unlock': '解锁用户',
  'PUT /api/system/users/:id/blacklist': '更新用户黑名单',
  'PUT /api/system/users/:id/tags': '分配用户标签',
  'POST /api/system/users/batch-delete': '批量删除用户',
  'POST /api/system/users/batch-status': '批量更新用户状态',
  'POST /api/system/users/batch-reset-pwd': '批量重置密码',
  'POST /api/system/users/export': '导出用户',

  // ── 角色管理 ──
  'POST /api/system/roles': '新增角色',
  'PUT /api/system/roles/:id': '编辑角色',
  'DELETE /api/system/roles/:id': '删除角色',
  'PUT /api/system/roles/:id/menus': '分配角色菜单',
  'PUT /api/system/roles/:id/data-scope': '分配角色数据权限',
  'POST /api/system/roles/batch-delete': '批量删除角色',

  // ── 菜单管理 ──
  'POST /api/system/menus': '新增菜单',
  'PUT /api/system/menus/:id': '编辑菜单',
  'DELETE /api/system/menus/:id': '删除菜单',

  // ── 部门管理 ──
  'POST /api/system/depts': '新增部门',
  'PUT /api/system/depts/:id': '编辑部门',
  'DELETE /api/system/depts/:id': '删除部门',
  'POST /api/system/depts/batch-delete': '批量删除部门',

  // ── 岗位管理 ──
  'POST /api/system/posts': '新增岗位',
  'PUT /api/system/posts/:id': '编辑岗位',
  'DELETE /api/system/posts/:id': '删除岗位',
  'POST /api/system/posts/batch-delete': '批量删除岗位',

  // ── 字典管理 ──
  'POST /api/system/dict/types': '新增字典类型',
  'PUT /api/system/dict/types/:id': '编辑字典类型',
  'DELETE /api/system/dict/types/:id': '删除字典类型',
  'POST /api/system/dict/data': '新增字典数据',
  'PUT /api/system/dict/data/:id': '编辑字典数据',
  'DELETE /api/system/dict/data/:id': '删除字典数据',
  'POST /api/system/dict/data/batch-delete': '批量删除字典数据',

  // ── 参数配置 ──
  'POST /api/system/configs': '新增参数',
  'PUT /api/system/configs/:id': '编辑参数',
  'DELETE /api/system/configs/:id': '删除参数',

  // ── 通知公告 ──
  'POST /api/system/notices': '新增公告',
  'PUT /api/system/notices/:id': '编辑公告',
  'DELETE /api/system/notices/:id': '删除公告',
  'PUT /api/system/notices/:id/publish': '上架公告',
  'PUT /api/system/notices/:id/revoke': '下架公告',
  'PUT /api/system/notices/:id/read': '标记已读',
  'POST /api/system/notices/batch-publish': '批量上架公告',
  'POST /api/system/notices/batch-revoke': '批量下架公告',
  'POST /api/system/notices/batch-delete': '批量删除公告',
  'POST /api/system/notices/batch-read': '批量标记已读',

  // ── 标签管理 ──
  'POST /api/system/tags': '新增标签',
  'PUT /api/system/tags/:id': '编辑标签',
  'DELETE /api/system/tags/:id': '删除标签',

  // ── 文件管理 ──
  'POST /api/system/oss/upload': '上传文件',
  'DELETE /api/system/oss/:id': '删除文件',

  // ── 消息通知 ──
  'POST /api/system/notification/send': '发送通知',
  'POST /api/system/notification/send-by-posts': '按岗位发送通知',
  'PUT /api/system/notification/messages/:id/read': '标记通知已读',
  'POST /api/system/notification/messages/read-batch': '批量标记通知已读',
  'POST /api/system/notification/messages/:id/retry': '重试发送通知',
  'DELETE /api/system/notification/messages/:id': '删除通知消息',
  'POST /api/system/notification/templates': '新增通知模板',
  'PUT /api/system/notification/templates/:id': '编辑通知模板',
  'DELETE /api/system/notification/templates/:id': '删除通知模板',

  // ── 定时任务 ──
  'POST /api/system/scheduler/jobs': '新增任务',
  'PUT /api/system/scheduler/jobs/:id': '编辑任务',
  'DELETE /api/system/scheduler/jobs/:id': '删除任务',
  'PUT /api/system/scheduler/jobs/:id/start': '启动任务',
  'PUT /api/system/scheduler/jobs/:id/stop': '停止任务',
  'POST /api/system/scheduler/jobs/:id/execute': '立即执行任务',

  // ── 代码生成 ──
  'POST /api/system/gen/tables/import': '导入数据表',
  'PUT /api/system/gen/tables/:id': '编辑生成表配置',
  'PUT /api/system/gen/columns/:id': '编辑生成字段配置',
  'POST /api/system/gen/tables/:id/generate': '生成代码',

  // ── 在线用户 ──
  'DELETE /api/system/monitor/online/:sessionId': '强制用户下线',

  // ── 国际化 ──
  'POST /api/i18n/locales': '新增语言',
  'PUT /api/i18n/locales/:id': '编辑语言',
  'DELETE /api/i18n/locales/:id': '删除语言',
  'POST /api/i18n/messages/set': '设置国际化文案',
  'POST /api/i18n/messages/import': '导入国际化文案',
  'DELETE /api/i18n/messages/:id': '删除国际化文案',

  // ── 工作流 ──
  'POST /api/workflow/definitions': '新增流程定义',
  'PUT /api/workflow/definitions/:id': '编辑流程定义',
  'DELETE /api/workflow/definitions/:id': '删除流程定义',
  'POST /api/workflow/definitions/:id/publish': '发布流程定义',
  'POST /api/workflow/definitions/:id/disable': '停用流程定义',
  'POST /api/workflow/definitions/:id/clone': '克隆流程定义',
  'PUT /api/workflow/definitions/:id/graph': '保存流程图',
  'POST /api/workflow/definitions/:id/graph/validate': '校验流程图',
  'POST /api/workflow/instances': '发起流程',
  'POST /api/workflow/instances/:id/withdraw': '撤回流程',
  'POST /api/workflow/tasks/:id/approve': '审批通过',
  'POST /api/workflow/tasks/:id/reject': '审批驳回',
  'POST /api/workflow/tasks/:id/transfer': '转办任务',
  'POST /api/workflow/tasks/:id/add-sign': '任务加签',
  'POST /api/workflow/tasks/:id/urge': '催办任务',

  // ── AI 链路 ──
  'PUT /api/ai/trace/config': '更新AI链路配置',

  // ── 个人中心 ──
  'PUT /api/system/user/profile': '更新个人资料',
  'PUT /api/system/user/profile/password': '修改个人密码',
  'POST /api/system/user/profile/avatar': '更新头像',
  'POST /api/system/user/mfa/enable': '启用MFA',
  'POST /api/system/user/mfa/disable': '禁用MFA',
  'POST /api/system/user/mfa/verify': '验证MFA',
  'PUT /api/system/user/passkey/register': '注册通行密钥',
  'POST /api/system/user/passkey/authenticate': '验证通行密钥',
  'DELETE /api/system/user/passkey/:id': '删除通行密钥',
};

function matchesActionTemplate(template: string, actual: string): boolean {
  const templateParts = template.split('/');
  const actualParts = actual.split('/');
  return (
    templateParts.length === actualParts.length &&
    templateParts.every((part, index) => part.startsWith(':') || part === actualParts[index])
  );
}

/**
 * 根据 HTTP 方法和路径生成业务操作描述
 */
export function resolveOperationAction(method: string, path: string): string {
  const normalized = normalizePath(path);
  const key = `${method} ${normalized}`;
  const exact = ACTION_DESCRIPTIONS[key];
  if (exact) return exact;

  for (const [templateKey, description] of Object.entries(ACTION_DESCRIPTIONS)) {
    const separator = templateKey.indexOf(' ');
    if (separator < 0 || templateKey.slice(0, separator) !== method) continue;
    if (matchesActionTemplate(templateKey.slice(separator + 1), path)) return description;
  }

  return `${resolveModule(path)}操作`;
}

/**
 * 将 IPv4 字符串转为数值
 */
function ipToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const n = Number.parseInt(part, 10);
    if (Number.isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

/**
 * CIDR 匹配
 *
 * 注意：当前仅支持 IPv4 CIDR 匹配。对于 IPv6 地址（包含 :），
 * 直接跳过 CIDR 匹配，仅支持精确字符串匹配。
 */
function matchCIDR(ip: string, cidr: string): boolean {
  // IPv6 地址不支持 CIDR 匹配，直接跳过
  if (ip.includes(':')) return false;

  const [network, bits] = cidr.split('/');
  if (!network || !bits) return false;
  const mask = Number.parseInt(bits, 10);
  if (Number.isNaN(mask) || mask < 0 || mask > 32) return false;

  const ipNum = ipToNumber(ip);
  const networkNum = ipToNumber(network);
  if (ipNum === null || networkNum === null) return false;

  const maskBits = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
  return (ipNum & maskBits) === (networkNum & maskBits);
}

/**
 * 判断 IP 是否匹配可信代理列表
 */
function isTrustedProxy(ip: string, trusted: string[]): boolean {
  if (trusted.length === 0) return false;
  for (const pattern of trusted) {
    if (pattern.includes('/')) {
      if (matchCIDR(ip, pattern)) return true;
    } else if (pattern === ip) {
      return true;
    }
  }
  return false;
}

/**
 * 从请求中提取客户端 IP
 *
 * 逻辑：
 * 1. 获取直接连接 IP（Bun.requestIP）
 * 2. 如果直接连接 IP 在可信代理列表中，尝试从 X-Forwarded-For / X-Real-IP 读取真实 IP
 * 3. 否则返回直接连接 IP
 *
 * 注意：当前 CIDR 可信代理匹配仅支持 IPv4。
 * 对于 IPv6 地址，直接返回连接 IP 而不尝试 CIDR 匹配。
 *
 * @param request - Request 对象
 * @param trustedProxies - 可信代理 IP/CIDR 列表
 */
/** 去掉 IPv6 映射前缀，如 ::ffff:192.168.1.1 → 192.168.1.1 */
function stripIPv6Mapping(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function extractClientIP(request: Request, trustedProxies: string[]): string {
  // 获取直接连接 IP
  const rawIP =
    (request as Request & { conn?: { remoteAddress?: string } }).conn?.remoteAddress ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const directIP = stripIPv6Mapping(rawIP);

  // 没有可信代理配置，返回直接连接 IP
  if (trustedProxies.length === 0) {
    return directIP;
  }

  // IPv6 地址：不尝试 CIDR 匹配，直接返回连接 IP
  if (directIP.includes(':')) {
    return directIP;
  }

  // 直接连接 IP 不在可信代理列表中，返回直接连接 IP（防止伪造）
  if (!isTrustedProxy(directIP, trustedProxies)) {
    return directIP;
  }

  // 来自可信代理，读取代理头获取真实客户端 IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for 可能包含多个 IP，取第一个（最左边的是原始客户端）
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return realIP.trim();

  return directIP;
}

/**
 * 递归脱敏对象中的敏感字段
 * @param obj 原始对象
 * @param sensitiveSet 敏感字段集合
 * @returns 脱敏后的对象
 */
function sanitize(obj: unknown, sensitiveSet: Set<string>): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitize(item, sensitiveSet));

  const sensitiveFields = Array.from(sensitiveSet);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveFieldName(key, sensitiveFields)) {
      result[key] = '******';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitize(value, sensitiveSet);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * 创建操作日志中间件
 *
 * 跳过 GET / HEAD / OPTIONS 请求，仅记录写操作。
 * 读取请求中的用户、方法、URL、IP、Body 信息，
 * 对 Body 中的敏感字段进行脱敏后异步写入审计日志。
 *
 * 同时写入内存审计链（AuditStore）和数据库持久化表。
 *
 * @param auditLog 审计日志存储实例
 * @param options 配置选项
 * @returns Middleware 实例
 */
export function createOperationLogMiddleware(
  auditLog: AuditStore,
  options?: OperationLogOptions,
): Middleware {
  const excludePaths = new Set(options?.excludePaths ?? []);
  const excludePrefixes = options?.excludePathPrefixes ?? [];
  const sensitiveSet = new Set([
    ...DEFAULT_SENSITIVE_FIELDS,
    ...(options?.sensitiveFields ?? []).map((f) => f.toLowerCase()),
  ]);
  const saveToDb = options?.saveToDb;
  const trustedProxies = options?.trustedProxies ?? [];

  return async (ctx, next) => {
    const method = ctx.method.toUpperCase();

    // 跳过读操作
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }

    const markedContext = ctx as typeof ctx & { [OPERATION_LOG_ACTIVE]?: boolean };
    if (markedContext[OPERATION_LOG_ACTIVE]) return next();
    markedContext[OPERATION_LOG_ACTIVE] = true;

    // 跳过排除路径（精确匹配）
    if (excludePaths.has(ctx.path)) {
      return next();
    }

    // 跳过排除路径（前缀匹配）
    for (const prefix of excludePrefixes) {
      if (ctx.path.startsWith(prefix)) {
        return next();
      }
    }

    // 提取请求信息
    const startTime = Date.now();
    const clientIP = extractClientIP(ctx.request, trustedProxies);
    const module = resolveModule(ctx.path);

    // 执行后续处理
    let responseStatus = 200;
    let errorMsg: string | null = null;
    try {
      const response = await next();
      responseStatus = response.status;
      return response;
    } catch (err) {
      responseStatus = 500;
      errorMsg = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      // 聚合路由上的日志中间件先于各模块认证/校验执行，因此在下游完成后读取用户和请求体。
      const user = ctx.user as { id?: string; username?: string } | undefined;
      const actor = user?.username ?? user?.id ?? 'anonymous';
      let sanitizedBody: unknown = null;
      try {
        const body = ctx.body;
        if (
          body &&
          typeof body === 'object' &&
          Object.keys(body as Record<string, unknown>).length > 0
        ) {
          sanitizedBody = sanitize(body, sensitiveSet);
        }
      } catch {
        sanitizedBody = null;
      }
      const duration = Date.now() - startTime;
      const resultValue = responseStatus < 400 ? 1 : 0;
      const paramsStr = sanitizedBody ? JSON.stringify(sanitizedBody) : null;

      // 异步写入内存审计链，不阻塞响应
      auditLog
        .append({
          actor,
          action: resolveOperationAction(method, ctx.path),
          resource: 'operation',
          result: responseStatus < 400 ? 'success' : 'failure',
          metadata: {
            method,
            url: ctx.path,
            duration,
            status: responseStatus,
            ...(sanitizedBody ? { body: sanitizedBody } : {}),
            ...(errorMsg ? { errorMsg } : {}),
          },
        })
        .catch(() => {
          // 审计日志写入失败不应影响已发出的响应
        });

      // 异步写入数据库持久化表，不阻塞响应
      if (saveToDb) {
        const dbEntry: OperationLogEntry = {
          id: crypto.randomUUID(),
          user_id: user?.id ?? null,
          username: actor,
          module,
          action: resolveOperationAction(method, ctx.path),
          method,
          url: ctx.path,
          ip: clientIP,
          location: describeIPLocation(clientIP),
          params: paramsStr,
          result: resultValue,
          error_msg: errorMsg,
          duration,
          created_at: new Date(),
        };
        saveToDb(dbEntry).catch(() => {
          // 数据库写入失败不应影响已发出的响应
        });
      }
    }
  };
}
