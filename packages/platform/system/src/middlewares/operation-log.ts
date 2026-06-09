/**
 * @ventostack/system - 操作日志中间件
 * 记录写操作的审计日志，自动脱敏敏感字段，异步写入不阻塞响应
 * 同时写入内存审计链和数据库持久化表
 */

import type { Middleware } from "@ventostack/core";
import type { AuditStore } from "@ventostack/observability";

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
  params: string | null;
  result: number;
  error_msg: string | null;
  duration: number;
  created_at: Date;
}

/** 默认需要脱敏的字段 */
const DEFAULT_SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "password_hash",
  "token",
  "secret",
  "key",
  "cookie",
  "authorization",
  "phone",
  "email",
  "idcard",
  "mfaSecret",
  "mfa_secret",
  "creditcard",
  "ssn",
  "apikey",
  "access_token",
  "refresh_token",
  "private_key",
  "connection_string",
  "database_url",
  "sessionid",
  "session_id",
  "resettoken",
  "reset_token",
  "temptoken",
  "temp_token",
  "mfarecovery",
  "mfa_recovery",
  "refreshtoken",
  "refresh_token_jti",
];

/** URL 路径前缀 → 模块中文名映射 */
const MODULE_MAP: Array<{ prefix: string; name: string }> = [
  { prefix: "/api/system/users", name: "用户管理" },
  { prefix: "/api/system/roles", name: "角色管理" },
  { prefix: "/api/system/menus", name: "菜单管理" },
  { prefix: "/api/system/depts", name: "部门管理" },
  { prefix: "/api/system/posts", name: "岗位管理" },
  { prefix: "/api/system/dict", name: "字典管理" },
  { prefix: "/api/system/configs", name: "参数配置" },
  { prefix: "/api/system/notices", name: "通知公告" },
  { prefix: "/api/system/login-logs", name: "登录日志" },
  { prefix: "/api/system/operation-logs", name: "操作日志" },
  { prefix: "/api/system/monitor", name: "系统监控" },
  { prefix: "/api/system/user", name: "个人中心" },
  { prefix: "/api/auth", name: "认证管理" },
  { prefix: "/api/system/scheduler", name: "定时任务" },
  { prefix: "/api/system/oss", name: "文件管理" },
  { prefix: "/api/system/gen", name: "代码生成" },
  { prefix: "/api/system/notification", name: "消息通知" },
];

/**
 * 根据 URL 路径推断模块名称
 * 匹配最长前缀，未匹配则返回 "其他"
 */
function resolveModule(path: string): string {
  let matched = "";
  let moduleName = "其他";
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
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
}

/**
 * `{METHOD} {normalizedPath}` → 业务操作描述
 * 未匹配时回退到 `{method} {path}`
 */
const ACTION_DESCRIPTIONS: Record<string, string> = {
  // ── 认证 ──
  "POST /api/auth/login": "登录",
  "POST /api/auth/register": "注册",
  "POST /api/auth/refresh": "刷新令牌",
  "POST /api/auth/logout": "退出登录",
  "PUT /api/auth/password": "修改密码",
  "PUT /api/auth/profile": "更新资料",

  // ── 用户管理 ──
  "POST /api/system/users": "新增用户",
  "PUT /api/system/users/:id": "编辑用户",
  "DELETE /api/system/users/:id": "删除用户",
  "PUT /api/system/users/:id/reset-password": "重置密码",
  "PUT /api/system/users/:id/status": "更新状态",

  // ── 角色管理 ──
  "POST /api/system/roles": "新增角色",
  "PUT /api/system/roles/:id": "编辑角色",
  "DELETE /api/system/roles/:id": "删除角色",

  // ── 菜单管理 ──
  "POST /api/system/menus": "新增菜单",
  "PUT /api/system/menus/:id": "编辑菜单",
  "DELETE /api/system/menus/:id": "删除菜单",

  // ── 部门管理 ──
  "POST /api/system/depts": "新增部门",
  "PUT /api/system/depts/:id": "编辑部门",
  "DELETE /api/system/depts/:id": "删除部门",

  // ── 岗位管理 ──
  "POST /api/system/posts": "新增岗位",
  "PUT /api/system/posts/:id": "编辑岗位",
  "DELETE /api/system/posts/:id": "删除岗位",

  // ── 字典管理 ──
  "POST /api/system/dict/types": "新增字典类型",
  "PUT /api/system/dict/types/:id": "编辑字典类型",
  "DELETE /api/system/dict/types/:id": "删除字典类型",
  "POST /api/system/dict/types/:id/data": "新增字典数据",
  "PUT /api/system/dict/data/:id": "编辑字典数据",
  "DELETE /api/system/dict/data/:id": "删除字典数据",

  // ── 参数配置 ──
  "POST /api/system/configs": "新增参数",
  "PUT /api/system/configs/:id": "编辑参数",
  "DELETE /api/system/configs/:id": "删除参数",

  // ── 通知公告 ──
  "POST /api/system/notices": "新增公告",
  "PUT /api/system/notices/:id": "编辑公告",
  "DELETE /api/system/notices/:id": "删除公告",
  "PUT /api/system/notices/:id/publish": "上架公告",
  "PUT /api/system/notices/:id/revoke": "下架公告",
  "PUT /api/system/notices/:id/read": "标记已读",
  "POST /api/system/notices/batch-publish": "批量上架公告",
  "POST /api/system/notices/batch-revoke": "批量下架公告",
  "POST /api/system/notices/batch-delete": "批量删除公告",

  // ── 文件管理 ──
  "POST /api/system/oss/upload": "上传文件",
  "DELETE /api/system/oss/:id": "删除文件",

  // ── 定时任务 ──
  "POST /api/system/scheduler": "新增任务",
  "PUT /api/system/scheduler/:id": "编辑任务",
  "DELETE /api/system/scheduler/:id": "删除任务",
  "PUT /api/system/scheduler/:id/toggle": "启停任务",
  "POST /api/system/scheduler/:id/execute": "立即执行",

  // ── 个人中心 ──
  "PUT /api/system/user/profile": "更新个人资料",
  "PUT /api/system/user/password": "修改个人密码",
  "PUT /api/system/user/avatar": "更新头像",
  "POST /api/system/user/mfa/enable": "启用MFA",
  "POST /api/system/user/mfa/disable": "禁用MFA",
  "POST /api/system/user/mfa/verify": "验证MFA",
  "PUT /api/system/user/passkey/register": "注册通行密钥",
  "POST /api/system/user/passkey/authenticate": "验证通行密钥",
  "DELETE /api/system/user/passkey/:id": "删除通行密钥",
};

/**
 * 根据 HTTP 方法和路径生成业务操作描述
 */
function resolveAction(method: string, path: string): string {
  const normalized = normalizePath(path);
  const key = `${method} ${normalized}`;
  return ACTION_DESCRIPTIONS[key] ?? `${method} ${path}`;
}

/**
 * 将 IPv4 字符串转为数值
 */
function ipToNumber(ip: string): number | null {
  const parts = ip.split(".");
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
  if (ip.includes(":")) return false;

  const [network, bits] = cidr.split("/");
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
    if (pattern.includes("/")) {
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
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function extractClientIP(request: Request, trustedProxies: string[]): string {
  // 获取直接连接 IP
  const rawIP =
    (request as Request & { conn?: { remoteAddress?: string } }).conn?.remoteAddress ?? "unknown";
  const directIP = stripIPv6Mapping(rawIP);

  // 尝试从 header 读取真实客户端 IP 的辅助函数
  const fromHeaders = (): string | null => {
    const realIP = request.headers.get("x-real-ip");
    if (realIP) return stripIPv6Mapping(realIP.trim());
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return stripIPv6Mapping(first);
    }
    return null;
  };

  // 直接连接 IP 不可用或是 loopback 时，尝试从 header 读取
  // （开发环境 Vite proxy、生产环境反向代理都会产生 loopback 连接）
  if (directIP === "unknown" || directIP.startsWith("127.")) {
    const headerIP = fromHeaders();
    if (headerIP) return headerIP;
  }

  // 没有可信代理配置，返回直接连接 IP
  if (trustedProxies.length === 0) {
    return directIP;
  }

  // IPv6 地址：不尝试 CIDR 匹配，直接返回连接 IP
  if (directIP.includes(":")) {
    return directIP;
  }

  // 直接连接 IP 不在可信代理列表中，返回直接连接 IP（防止伪造）
  if (!isTrustedProxy(directIP, trustedProxies)) {
    return directIP;
  }

  // 来自可信代理，读取代理头获取真实客户端 IP
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for 可能包含多个 IP，取第一个（最左边的是原始客户端）
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIP = request.headers.get("x-real-ip");
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
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((item) => sanitize(item, sensitiveSet));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (sensitiveSet.has(key.toLowerCase())) {
      result[key] = "******";
    } else if (typeof value === "object" && value !== null) {
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
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }

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
    const user = ctx.user as { id?: string; username?: string } | undefined;
    const actor = user?.username ?? user?.id ?? "anonymous";
    const startTime = Date.now();
    const clientIP = extractClientIP(ctx.request, trustedProxies);
    const module = resolveModule(ctx.path);

    // 读取并脱敏请求体
    let sanitizedBody: unknown = null;
    try {
      const body = ctx.body;
      if (
        body &&
        typeof body === "object" &&
        Object.keys(body as Record<string, unknown>).length > 0
      ) {
        sanitizedBody = sanitize(body, sensitiveSet);
      }
    } catch {
      sanitizedBody = null;
    }

    // 执行后续处理
    let responseStatus = 200;
    let errorMsg: string | null = null;
    try {
      const response = await next();
      responseStatus = response.status;
      return response;
    } catch (err) {
      responseStatus = 500;
      errorMsg = err instanceof Error ? err.message : "Unknown error";
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      const resultValue = responseStatus < 400 ? 1 : 0;
      const paramsStr = sanitizedBody ? JSON.stringify(sanitizedBody) : null;

      // 异步写入内存审计链，不阻塞响应
      auditLog
        .append({
          actor,
          action: resolveAction(method, ctx.path),
          resource: "operation",
          result: responseStatus < 400 ? "success" : "failure",
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
          action: resolveAction(method, ctx.path),
          method,
          url: ctx.path,
          ip: clientIP,
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
