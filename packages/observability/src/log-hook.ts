// @aeron/observability - Log Hook（发送到 VictoriaLogs / Loki 等）

export interface LogHookConfig {
  /** 目标 URL（如 VictoriaLogs / Loki endpoint） */
  endpoint: string;
  /** 批量发送大小 */
  batchSize?: number;
  /** 发送间隔（ms） */
  flushInterval?: number;
  /** 自定义 headers */
  headers?: Record<string, string>;
  /** 格式化函数 */
  format?: (entry: LogEntry) => string;
}

export interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
  fields?: Record<string, unknown>;
}

export interface LogHook {
  send(entry: LogEntry): void;
  flush(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
  pending(): number;
}

/**
 * 创建 Log Hook，异步批量发送到远端日志系统
 */
export function createLogHook(config: LogHookConfig): LogHook {
  const batchSize = config.batchSize ?? 50;
  const flushInterval = config.flushInterval ?? 2000;
  const format = config.format ?? defaultFormat;
  let buffer: string[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;

  function defaultFormat(entry: LogEntry): string {
    return JSON.stringify({
      _time: new Date(entry.timestamp).toISOString(),
      _msg: entry.message,
      level: entry.level,
      ...entry.fields,
    });
  }

  async function doFlush(): Promise<void> {
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    const body = batch.join("\n");

    try {
      await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-ndjson",
          ...config.headers,
        },
        body,
      });
    } catch {
      // 网络失败，放回缓冲区（有界限，避免内存泄漏）
      if (buffer.length < batchSize * 10) {
        buffer.unshift(...batch);
      }
    }
  }

  return {
    send(entry: LogEntry): void {
      buffer.push(format(entry));
      if (buffer.length >= batchSize) {
        doFlush();
      }
    },

    async flush(): Promise<void> {
      await doFlush();
    },

    start(): void {
      if (timer) return;
      timer = setInterval(() => { doFlush(); }, flushInterval);
    },

    async stop(): Promise<void> {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await doFlush();
    },

    pending(): number {
      return buffer.length;
    },
  };
}
