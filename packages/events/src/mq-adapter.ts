// @aeron/events - 消息队列适配器接口

export interface MQAdapter {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, message: MQMessage): Promise<void>;
  subscribe(topic: string, handler: MQMessageHandler): Promise<() => void>;
  isConnected(): boolean;
}

export interface MQMessage {
  id?: string;
  body: unknown;
  headers?: Record<string, string>;
  timestamp?: number;
}

export type MQMessageHandler = (message: MQMessage) => Promise<void>;

export interface MQAdapterConfig {
  type: "kafka" | "rabbitmq" | "nats" | "rocketmq" | "memory";
  url?: string;
  options?: Record<string, unknown>;
}

/**
 * 创建内存 MQ 适配器（用于开发和测试）
 */
export function createMemoryMQAdapter(): MQAdapter {
  const subscribers = new Map<string, Set<MQMessageHandler>>();
  let connected = false;

  return {
    name: "memory",

    async connect(): Promise<void> {
      connected = true;
    },

    async disconnect(): Promise<void> {
      connected = false;
      subscribers.clear();
    },

    async publish(topic: string, message: MQMessage): Promise<void> {
      if (!connected) throw new Error("MQ adapter not connected");
      const msg = { ...message, id: message.id ?? crypto.randomUUID(), timestamp: message.timestamp ?? Date.now() };
      const handlers = subscribers.get(topic);
      if (handlers) {
        for (const handler of handlers) {
          await handler(msg);
        }
      }
    },

    async subscribe(topic: string, handler: MQMessageHandler): Promise<() => void> {
      if (!connected) throw new Error("MQ adapter not connected");
      let handlers = subscribers.get(topic);
      if (!handlers) {
        handlers = new Set();
        subscribers.set(topic, handlers);
      }
      handlers.add(handler);
      return () => { handlers!.delete(handler); };
    },

    isConnected(): boolean {
      return connected;
    },
  };
}

/**
 * 创建 MQ 适配器工厂
 * 外部 MQ (Kafka/RabbitMQ/NATS) 需要用户提供具体实现
 */
export function createMQAdapterFactory(): {
  register(type: string, factory: (config: MQAdapterConfig) => MQAdapter): void;
  create(config: MQAdapterConfig): MQAdapter;
} {
  const factories = new Map<string, (config: MQAdapterConfig) => MQAdapter>();
  factories.set("memory", () => createMemoryMQAdapter());

  return {
    register(type: string, factory: (config: MQAdapterConfig) => MQAdapter): void {
      factories.set(type, factory);
    },

    create(config: MQAdapterConfig): MQAdapter {
      const factory = factories.get(config.type);
      if (!factory) throw new Error(`Unknown MQ adapter type: ${config.type}`);
      return factory(config);
    },
  };
}
