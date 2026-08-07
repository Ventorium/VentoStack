/**
 * Agent 消息队列
 *
 * 对齐参考实现的 PendingMessageQueue：
 * - Steering queue：在 agent 执行过程中注入新消息（中断/重定向）
 * - Follow-up queue：在当前 turn 结束后追加新消息
 * - 支持 "all" | "one-at-a-time" 排空模式
 */

/** 队列排空模式 */
export type QueueMode = "all" | "one-at-a-time";

export interface MessageQueue<T> {
  /** 入队 */
  enqueue(message: T): void;
  /** 是否有待处理消息 */
  hasItems(): boolean;
  /** 排空（根据 mode 返回消息并移除） */
  drain(): T[];
  /** 清空队列 */
  clear(): T[];
  /** 获取当前队列长度 */
  size(): number;
  /** 获取当前模式 */
  getMode(): QueueMode;
  /** 设置模式 */
  setMode(mode: QueueMode): void;
}

export function createMessageQueue<T>(
  mode: QueueMode = "all",
): MessageQueue<T> {
  const messages: T[] = [];
  let currentMode = mode;

  function enqueue(message: T): void {
    messages.push(message);
  }

  function hasItems(): boolean {
    return messages.length > 0;
  }

  function drain(): T[] {
    if (currentMode === "all") {
      const drained = messages.slice();
      messages.length = 0;
      return drained;
    }
    // one-at-a-time
    if (messages.length === 0) return [];
    const first = messages.shift()!;
    return [first];
  }

  function clear(): T[] {
    const cleared = messages.slice();
    messages.length = 0;
    return cleared;
  }

  function size(): number {
    return messages.length;
  }

  function getMode(): QueueMode {
    return currentMode;
  }

  function setMode(mode: QueueMode): void {
    currentMode = mode;
  }

  return {
    enqueue,
    hasItems,
    drain,
    clear,
    size,
    getMode,
    setMode,
  };
}
