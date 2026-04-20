// @aeron/observability - 异步日志写入

export interface AsyncWriterOptions {
  /** 缓冲区大小 */
  bufferSize?: number;
  /** 刷新间隔（ms） */
  flushInterval?: number;
  /** 写入函数 */
  write: (entries: string[]) => Promise<void>;
}

export interface AsyncWriter {
  push(entry: string): void;
  flush(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
  pending(): number;
}

/**
 * 创建异步日志写入器
 * 批量收集日志后异步写入，避免阻塞业务线程
 */
export function createAsyncWriter(options: AsyncWriterOptions): AsyncWriter {
  const bufferSize = options.bufferSize ?? 100;
  const flushInterval = options.flushInterval ?? 1000;
  let buffer: string[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let flushing = false;

  async function doFlush(): Promise<void> {
    if (flushing || buffer.length === 0) return;
    flushing = true;
    const batch = buffer.splice(0, buffer.length);
    try {
      await options.write(batch);
    } catch {
      // 写入失败，放回缓冲区头部
      buffer.unshift(...batch);
    } finally {
      flushing = false;
    }
  }

  return {
    push(entry: string): void {
      buffer.push(entry);
      if (buffer.length >= bufferSize) {
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
