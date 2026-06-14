/**
 * 轻量进度事件发射器
 */
import type { ConvertProgressEvent, ProgressEventType } from "../types";

export type ProgressHandler = (event: ConvertProgressEvent) => void;

export function createProgressEmitter(handler?: ProgressHandler) {
  return {
    emit(type: ProgressEventType, data: Partial<ConvertProgressEvent> = {}): void {
      if (!handler) return;
      handler({
        type,
        fileName: data.fileName ?? "",
        message: data.message,
        progress: data.progress,
        error: data.error,
      });
    },
  };
}
