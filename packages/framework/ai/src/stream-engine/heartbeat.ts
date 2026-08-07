/**
 * SSE 心跳保活
 * 定期发送 `: heartbeat\n\n` 防止连接被代理/CDN 超时断开
 */

export interface HeartbeatConfig {
  /** 心跳间隔（毫秒），默认 15000 */
  intervalMs: number;
}

export interface HeartbeatController {
  /** 启动心跳，返回取消函数 */
  start(controller: ReadableStreamDefaultController, encoder: TextEncoder): () => void;
}

export function createHeartbeat(config?: Partial<HeartbeatConfig>): HeartbeatController {
  const intervalMs = config?.intervalMs ?? 15_000;

  function start(
    controller: ReadableStreamDefaultController,
    encoder: TextEncoder,
  ): () => void {
    const timer = setInterval(() => {
      try {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      } catch {
        // 流已关闭，停止心跳
        clearInterval(timer);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }

  return { start };
}
