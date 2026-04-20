// @aeron/observability — Structured Logger

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  fatal(message: string, meta?: Record<string, unknown>): void;
  child(defaultMeta: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  enabled?: boolean;
  output?: (entry: LogEntry) => void;
  sensitiveFields?: string[];
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const DEFAULT_SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "key",
  "cookie",
  "authorization",
];

function redactValue(
  value: unknown,
  sensitiveFields: string[],
): unknown {
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

function redactMeta(
  meta: Record<string, unknown>,
  sensitiveFields: string[],
): Record<string, unknown> {
  return redactValue(meta, sensitiveFields) as Record<string, unknown>;
}

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  child() {
    return noopLogger;
  },
};

export function createLogger(options?: LoggerOptions): Logger {
  const enabled = options?.enabled ?? true;
  if (!enabled) return noopLogger;

  const minLevel = options?.level ?? "info";
  const output = options?.output ?? ((entry: LogEntry) => {
    console.log(JSON.stringify(entry));
  });
  const sensitiveFields = (options?.sensitiveFields ?? DEFAULT_SENSITIVE_FIELDS).map(
    (f) => f.toLowerCase(),
  );

  return buildLogger(minLevel, output, sensitiveFields, {});
}

function buildLogger(
  minLevel: LogLevel,
  output: (entry: LogEntry) => void,
  sensitiveFields: string[],
  baseMeta: Record<string, unknown>,
): Logger {
  function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[minLevel]) return;

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
    debug(message, meta) { log("debug", message, meta); },
    info(message, meta) { log("info", message, meta); },
    warn(message, meta) { log("warn", message, meta); },
    error(message, meta) { log("error", message, meta); },
    fatal(message, meta) { log("fatal", message, meta); },
    child(defaultMeta) {
      return buildLogger(minLevel, output, sensitiveFields, {
        ...baseMeta,
        ...defaultMeta,
      });
    },
  };
}
