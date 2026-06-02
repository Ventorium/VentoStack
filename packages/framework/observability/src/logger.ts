/**
 * @ventostack/observability — Structured Logger
 * 提供结构化 JSON 日志输出、级别过滤、子记录器继承与自动脱敏能力
 * 支持通过 enabled 开关完全禁用（返回 no-op 记录器），禁用时不产生任何副作用
 */

/** 日志级别，从低到高依次为 debug < info < warn < error < fatal */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/** 单条结构化日志条目 */
export interface LogEntry {
  /** ISO 8601 格式时间戳 */
  timestamp: string;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息正文 */
  message: string;
  /** 扩展字段，可携带任意结构化元数据 */
  [key: string]: unknown;
}

/** 日志记录器接口 */
export interface Logger {
  /** 输出 debug 级别日志
   * @param message 日志消息
   * @param meta 可选的结构化元数据 */
  debug(message: string, meta?: Record<string, unknown>): void;
  /** 输出 info 级别日志
   * @param message 日志消息
   * @param meta 可选的结构化元数据 */
  info(message: string, meta?: Record<string, unknown>): void;
  /** 输出 warn 级别日志
   * @param message 日志消息
   * @param meta 可选的结构化元数据 */
  warn(message: string, meta?: Record<string, unknown>): void;
  /** 输出 error 级别日志
   * @param message 日志消息
   * @param meta 可选的结构化元数据 */
  error(message: string, meta?: Record<string, unknown>): void;
  /** 输出 fatal 级别日志
   * @param message 日志消息
   * @param meta 可选的结构化元数据 */
  fatal(message: string, meta?: Record<string, unknown>): void;
  /** 创建子日志记录器，继承当前默认元数据
   * @param defaultMeta 子记录器默认携带的元数据
   * @returns 新的 Logger 实例 */
  child(defaultMeta: Record<string, unknown>): Logger;
  /** 动态调整最低输出级别 */
  setLevel(level: LogLevel): void;
}

/** 日志记录器配置选项 */
export interface LoggerOptions {
  /** 最低输出级别，低于此级别的日志将被丢弃 */
  level?: LogLevel;
  /** 是否启用日志输出，false 时返回 no-op 记录器 */
  enabled?: boolean;
  /** 自定义日志输出函数，默认输出 JSON 到 console */
  output?: (entry: LogEntry) => void;
  /** 需要脱敏的字段名列表（不区分大小写），默认包含 password、token 等 */
  sensitiveFields?: string[];
}

/** 日志级别优先级映射，数值越大优先级越高 */
const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

/** 默认脱敏字段列表（不区分大小写匹配） */
const DEFAULT_SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "key",
  "cookie",
  "authorization",
  "phone",
  "email",
  "idcard",
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

/** 递归脱敏任意值
 * @param value 待脱敏的值
 * @param sensitiveFields 敏感字段名列表
 * @returns 脱敏后的值 */
function redactValue(value: unknown, sensitiveFields: string[]): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, sensitiveFields));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (sensitiveFields.includes(k.toLowerCase())) {
        result[k] = "***";
      } else {
        result[k] = redactValue(v, sensitiveFields);
      }
    }
    return result;
  }
  return value;
}

/** 对元数据对象进行脱敏处理
 * @param meta 原始元数据
 * @param sensitiveFields 敏感字段名列表
 * @returns 脱敏后的元数据对象 */
function redactMeta(
  meta: Record<string, unknown>,
  sensitiveFields: string[],
): Record<string, unknown> {
  return redactValue(meta, sensitiveFields) as Record<string, unknown>;
}

/** 对任意值进行递归脱敏（公共 API，供审计日志等模块复用）
 * 使用默认敏感字段列表，递归遍历对象并将匹配字段替换为 "***"
 * @param value 待脱敏的值
 * @returns 脱敏后的值 */
export function sanitize(value: unknown): unknown {
  const fields = DEFAULT_SENSITIVE_FIELDS.map((f) => f.toLowerCase());
  return redactValue(value, fields);
}

/** 无操作日志记录器，用于日志被禁用时 */
const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  child() {
    return noopLogger;
  },
  setLevel() {},
};

/** 创建结构化日志记录器
 * @param options 可选配置项
 * @returns Logger 实例 */
export function createLogger(options?: LoggerOptions): Logger {
  const enabled = options?.enabled ?? true;
  if (!enabled) return noopLogger;

  const state: { level: LogLevel } = {
    level: options?.level ?? "info",
  };
  const output =
    options?.output ??
    ((entry: LogEntry) => {
      console.log(JSON.stringify(entry));
    });
  const sensitiveFields = (options?.sensitiveFields ?? DEFAULT_SENSITIVE_FIELDS).map((f) =>
    f.toLowerCase(),
  );

  return buildLogger(state, output, sensitiveFields, {});
}

/** 全局默认日志单例 */
let _defaultLogger: Logger | null = null;

/** 获取全局默认日志记录器（懒初始化，首次调用时创建）
 * @param options 首次初始化时的配置（后续调用忽略）
 * @returns Logger 单例 */
export function getDefaultLogger(options?: LoggerOptions): Logger {
  if (!_defaultLogger) {
    _defaultLogger = createLogger(options);
  }
  return _defaultLogger;
}

/** 构建具体日志记录器实现
 * @param minLevel 最低输出级别
 * @param output 日志输出函数
 * @param sensitiveFields 脱敏字段列表
 * @param baseMeta 基础默认元数据
 * @returns Logger 实例 */
function buildLogger(
  state: { level: LogLevel },
  output: (entry: LogEntry) => void,
  sensitiveFields: string[],
  baseMeta: Record<string, unknown>,
): Logger {
  function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[state.level]) return;

    const merged = { ...baseMeta, ...meta };
    const redacted = redactMeta(merged, sensitiveFields);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...redacted,
    };

    output(entry);
  }

  return {
    debug(message, meta) {
      log("debug", message, meta);
    },
    info(message, meta) {
      log("info", message, meta);
    },
    warn(message, meta) {
      log("warn", message, meta);
    },
    error(message, meta) {
      log("error", message, meta);
    },
    fatal(message, meta) {
      log("fatal", message, meta);
    },
    child(defaultMeta) {
      return buildLogger(state, output, sensitiveFields, {
        ...baseMeta,
        ...defaultMeta,
      });
    },
    setLevel(level) {
      state.level = level;
    },
  };
}
