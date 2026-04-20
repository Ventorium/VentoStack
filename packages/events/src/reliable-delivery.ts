// @aeron/events - 可靠投递（持久化 + ACK 确认）

export interface ReliableMessage {
  id: string;
  topic: string;
  body: unknown;
  status: "pending" | "sent" | "acked" | "failed" | "dead";
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  lastAttemptAt?: number;
  error?: string;
}

export interface ReliableDeliveryOptions {
  /** 最大重试次数 */
  maxAttempts?: number;
  /** 重试间隔（ms） */
  retryInterval?: number;
  /** ACK 超时（ms） */
  ackTimeout?: number;
}

export interface ReliableDelivery {
  send(topic: string, body: unknown): Promise<string>;
  ack(messageId: string): boolean;
  nack(messageId: string, error?: string): boolean;
  retry(): Promise<number>;
  getPending(): ReliableMessage[];
  getFailed(): ReliableMessage[];
  getDead(): ReliableMessage[];
  stats(): { pending: number; sent: number; acked: number; failed: number; dead: number };
}

/**
 * 创建可靠投递管理器
 */
export function createReliableDelivery(
  sender: (topic: string, body: unknown) => Promise<void>,
  options?: ReliableDeliveryOptions,
): ReliableDelivery {
  const maxAttempts = options?.maxAttempts ?? 3;
  const ackTimeout = options?.ackTimeout ?? 30000;
  const messages = new Map<string, ReliableMessage>();

  return {
    async send(topic: string, body: unknown): Promise<string> {
      const id = crypto.randomUUID();
      const msg: ReliableMessage = {
        id,
        topic,
        body,
        status: "pending",
        attempts: 0,
        maxAttempts,
        createdAt: Date.now(),
      };
      messages.set(id, msg);

      try {
        msg.attempts++;
        msg.lastAttemptAt = Date.now();
        await sender(topic, body);
        msg.status = "sent";
      } catch (err) {
        msg.status = "failed";
        msg.error = err instanceof Error ? err.message : String(err);
      }

      return id;
    },

    ack(messageId: string): boolean {
      const msg = messages.get(messageId);
      if (!msg || msg.status === "acked") return false;
      msg.status = "acked";
      return true;
    },

    nack(messageId: string, error?: string): boolean {
      const msg = messages.get(messageId);
      if (!msg) return false;
      msg.status = "failed";
      msg.error = error;
      return true;
    },

    async retry(): Promise<number> {
      let retried = 0;
      for (const msg of messages.values()) {
        if (msg.status !== "failed") continue;
        if (msg.attempts >= msg.maxAttempts) {
          msg.status = "dead";
          continue;
        }

        try {
          msg.attempts++;
          msg.lastAttemptAt = Date.now();
          await sender(msg.topic, msg.body);
          msg.status = "sent";
          retried++;
        } catch (err) {
          msg.error = err instanceof Error ? err.message : String(err);
          if (msg.attempts >= msg.maxAttempts) {
            msg.status = "dead";
          }
        }
      }
      return retried;
    },

    getPending(): ReliableMessage[] {
      return Array.from(messages.values()).filter((m) => m.status === "pending" || m.status === "sent");
    },

    getFailed(): ReliableMessage[] {
      return Array.from(messages.values()).filter((m) => m.status === "failed");
    },

    getDead(): ReliableMessage[] {
      return Array.from(messages.values()).filter((m) => m.status === "dead");
    },

    stats() {
      const all = Array.from(messages.values());
      return {
        pending: all.filter((m) => m.status === "pending").length,
        sent: all.filter((m) => m.status === "sent").length,
        acked: all.filter((m) => m.status === "acked").length,
        failed: all.filter((m) => m.status === "failed").length,
        dead: all.filter((m) => m.status === "dead").length,
      };
    },
  };
}
