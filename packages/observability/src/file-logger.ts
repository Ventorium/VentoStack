// @aeron/observability — File Logger with Rotation

import { appendFileSync, renameSync, unlinkSync, existsSync, statSync } from "node:fs";
import { createLogger, type Logger, type LogLevel, type LogEntry } from "./logger";

export interface FileLoggerOptions {
  filePath: string;
  maxSize?: number;
  maxFiles?: number;
  level?: LogLevel;
  sensitiveFields?: string[];
}

export interface FileLogger extends Logger {
  rotate(): Promise<void>;
  close(): void;
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILES = 5;

function getRotatedPath(basePath: string, index: number): string {
  const lastDot = basePath.lastIndexOf(".");
  if (lastDot === -1) {
    return `${basePath}.${index}`;
  }
  const name = basePath.slice(0, lastDot);
  const ext = basePath.slice(lastDot);
  return `${name}.${index}${ext}`;
}

function getFileSize(filePath: string): number {
  try {
    if (!existsSync(filePath)) return 0;
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

export function createFileLogger(options: FileLoggerOptions): FileLogger {
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  let closed = false;

  function rotateSync(): void {
    // Remove the oldest file if it exceeds maxFiles
    const oldest = getRotatedPath(options.filePath, maxFiles);
    if (existsSync(oldest)) {
      unlinkSync(oldest);
    }

    // Shift existing rotated files
    for (let i = maxFiles - 1; i >= 1; i--) {
      const from = getRotatedPath(options.filePath, i);
      const to = getRotatedPath(options.filePath, i + 1);
      if (existsSync(from)) {
        renameSync(from, to);
      }
    }

    // Rotate current file to .1
    if (existsSync(options.filePath)) {
      renameSync(options.filePath, getRotatedPath(options.filePath, 1));
    }
  }

  function writeEntry(entry: LogEntry): void {
    if (closed) return;

    // Check size before writing, auto-rotate if needed
    const currentSize = getFileSize(options.filePath);
    if (currentSize >= maxSize) {
      rotateSync();
    }

    const line = JSON.stringify(entry) + "\n";
    appendFileSync(options.filePath, line, "utf-8");
  }

  // Create internal logger that delegates to our file writer
  const inner = createLogger({
    level: options.level,
    sensitiveFields: options.sensitiveFields,
    output: writeEntry,
  });

  return {
    debug(message, meta) { inner.debug(message, meta); },
    info(message, meta) { inner.info(message, meta); },
    warn(message, meta) { inner.warn(message, meta); },
    error(message, meta) { inner.error(message, meta); },
    fatal(message, meta) { inner.fatal(message, meta); },
    child(defaultMeta) { return inner.child(defaultMeta); },
    async rotate(): Promise<void> {
      rotateSync();
    },
    close(): void {
      closed = true;
    },
  };
}
