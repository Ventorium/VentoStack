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
 * 从请求中提取客户端 IP
 * 优先读取 x-forwarded-for（取第一个），其次 x-real-ip，兜底 "unknown"
 */
function extractClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for 可能包含多个 IP，取第一个（最左边的是原始客户端）
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP.trim();
  return "unknown";
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
    const clientIP = extractClientIP(ctx.request);
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
          action: `${method} ${ctx.path}`,
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
          action: `${method} ${ctx.path}`,
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
