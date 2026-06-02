/**
 * @ventostack/observability - 错误上报（Sentry / 钉钉告警 / Webhook）
 * 提供多通道错误上报能力，支持采样率控制、忽略模式与环境/服务标识
 * 内置 Sentry、钉钉 Webhook、通用 Webhook 三种告警通道
 *
 * 所有 context 数据在上报前会自动递归脱敏，防止敏感信息泄露到外部通道
 */

export interface ErrorReporterConfig {
  /** 上报通道 */
  channels: ErrorChannel[];
  /** 采样率 0-1 */
  sampleRate?: number;
  /** 忽略的错误模式 */
  ignorePatterns?: RegExp[];
  /** 环境标识 */
  environment?: string;
  /** 服务名称 */
  serviceName?: string;
}

export interface ErrorChannel {
  name: string;
  report(error: ErrorReport): Promise<void>;
}

export interface ErrorReport {
  message: string;
  stack?: string;
  level: "error" | "warning" | "fatal";
  timestamp: number;
  context?: Record<string, unknown>;
  environment?: string;
  serviceName?: string;
}

export interface ErrorReporter {
  capture(
    error: Error | string,
    context?: Record<string, unknown>,
    level?: ErrorReport["level"],
  ): Promise<void>;
  captureWarning(message: string, context?: Record<string, unknown>): Promise<void>;
  captureFatal(error: Error | string, context?: Record<string, unknown>): Promise<void>;
}

/** 默认需要脱敏的字段名（小写），与 logger.ts 保持一致 */
const DEFAULT_SENSITIVE_FIELDS = [
  "password",
  "passwordhash",
  "password_hash",
  "token",
  "secret",
  "key",
  "cookie",
  "authorization",
  "phone",
  "email",
  "idcard",
  "mfarecret",
  "mfa_secret",
];

/**
 * 递归脱敏对象中的敏感字段
 * 与 logger.ts 中的 redactValue 逻辑一致
 */
function sanitizeContext(value: unknown, sensitiveFields: string[]): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeContext(item, sensitiveFields));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (sensitiveFields.includes(k.toLowerCase())) {
        result[k] = "***";
      } else {
        result[k] = sanitizeContext(v, sensitiveFields);
      }
    }
    return result;
  }
  return value;
}

/**
 * 创建错误上报器
 */
export function createErrorReporter(config: ErrorReporterConfig): ErrorReporter {
  const sampleRate = config.sampleRate ?? 1.0;

  function shouldReport(): boolean {
    return Math.random() < sampleRate;
  }

  function isIgnored(message: string): boolean {
    return config.ignorePatterns?.some((p) => p.test(message)) ?? false;
  }

  async function report(
    error: Error | string,
    context?: Record<string, unknown>,
    level: ErrorReport["level"] = "error",
  ): Promise<void> {
    if (!shouldReport()) return;

    const message = error instanceof Error ? error.message : error;
    if (isIgnored(message)) return;

    const report: ErrorReport = {
      message,
      level,
      timestamp: Date.now(),
    };
    if (error instanceof Error && error.stack) report.stack = error.stack;
    // 对 context 执行递归脱敏后再上报，防止敏感信息泄露到外部通道
    if (context) {
      report.context = sanitizeContext(context, DEFAULT_SENSITIVE_FIELDS) as Record<string, unknown>;
    }
    if (config.environment) report.environment = config.environment;
    if (config.serviceName) report.serviceName = config.serviceName;

    await Promise.allSettled(config.channels.map((ch) => ch.report(report)));
  }

  return {
    async capture(error, context, level) {
      await report(error, context, level ?? "error");
    },
    async captureWarning(message, context) {
      await report(message, context, "warning");
    },
    async captureFatal(error, context) {
      await report(error, context, "fatal");
    },
  };
}

/**
 * 创建 Sentry 通道
 */
export function createSentryChannel(dsn: string): ErrorChannel {
  return {
    name: "sentry",
    async report(error) {
      // 简化的 Sentry 上报（实际应使用 Sentry SDK envelope 格式）
      await fetch(dsn, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: crypto.randomUUID().replace(/-/g, ""),
          timestamp: error.timestamp / 1000,
          level: error.level,
          message: { formatted: error.message },
          exception: error.stack
            ? { values: [{ type: "Error", value: error.message, stacktrace: { frames: [] } }] }
            : undefined,
          environment: error.environment,
          server_name: error.serviceName,
          extra: error.context,
        }),
      });
    },
  };
}

/**
 * 创建钉钉 Webhook 通道
 */
export function createDingTalkChannel(webhookUrl: string): ErrorChannel {
  return {
    name: "dingtalk",
    async report(error) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: {
            title: `[${error.level.toUpperCase()}] ${error.serviceName ?? "unknown"}`,
            text: [
              `### ${error.level === "fatal" ? "🔴" : error.level === "error" ? "🟠" : "🟡"} ${error.level.toUpperCase()}`,
              `**Service**: ${error.serviceName ?? "unknown"}`,
              `**Env**: ${error.environment ?? "unknown"}`,
              `**Time**: ${new Date(error.timestamp).toISOString()}`,
              `**Message**: ${error.message}`,
              error.stack ? `\`\`\`\n${error.stack.slice(0, 500)}\n\`\`\`` : "",
            ].join("\n\n"),
          },
        }),
      });
    },
  };
}

/**
 * 创建通用 Webhook 通道
 */
export function createWebhookChannel(url: string, headers?: Record<string, string>): ErrorChannel {
  return {
    name: "webhook",
    async report(error) {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(error),
      });
    },
  };
}
