// @aeron/core - gRPC 抽象层（基于 HTTP/2 的类型安全 RPC）

export interface ServiceDefinition {
  name: string;
  methods: Record<string, MethodDefinition>;
}

export interface MethodDefinition {
  requestType: string;
  responseType: string;
  /** 是否为流式方法 */
  streaming?: "client" | "server" | "bidi";
}

export interface GRPCHandler<TReq = unknown, TRes = unknown> {
  (request: TReq, context: GRPCContext): Promise<TRes>;
}

export interface GRPCContext {
  metadata: Map<string, string>;
  deadline?: number;
  cancelled: boolean;
}

export interface GRPCServer {
  addService(service: ServiceDefinition, handlers: Record<string, GRPCHandler>): void;
  getServices(): ServiceDefinition[];
  call<TReq, TRes>(serviceName: string, methodName: string, request: TReq, metadata?: Record<string, string>): Promise<TRes>;
}

export interface GRPCStatus {
  code: number;
  message: string;
}

export const GRPCStatusCode = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  UNAUTHENTICATED: 16,
  UNAVAILABLE: 14,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
} as const;

export class GRPCError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 创建 gRPC 服务器抽象
 * 内部使用 JSON 序列化（非 protobuf），适合内部服务通信
 */
export function createGRPCServer(): GRPCServer {
  const services = new Map<string, { definition: ServiceDefinition; handlers: Record<string, GRPCHandler> }>();

  return {
    addService(service: ServiceDefinition, handlers: Record<string, GRPCHandler>): void {
      // 验证所有方法都有对应 handler
      for (const methodName of Object.keys(service.methods)) {
        if (!handlers[methodName]) {
          throw new Error(`Missing handler for method: ${service.name}/${methodName}`);
        }
      }
      services.set(service.name, { definition: service, handlers });
    },

    getServices(): ServiceDefinition[] {
      return Array.from(services.values()).map((s) => s.definition);
    },

    async call<TReq, TRes>(
      serviceName: string,
      methodName: string,
      request: TReq,
      metadata?: Record<string, string>,
    ): Promise<TRes> {
      const service = services.get(serviceName);
      if (!service) {
        throw new GRPCError(GRPCStatusCode.NOT_FOUND, `Service not found: ${serviceName}`);
      }

      const method = service.definition.methods[methodName];
      if (!method) {
        throw new GRPCError(GRPCStatusCode.UNIMPLEMENTED, `Method not found: ${serviceName}/${methodName}`);
      }

      const handler = service.handlers[methodName];
      if (!handler) {
        throw new GRPCError(GRPCStatusCode.UNIMPLEMENTED, `Handler not found: ${serviceName}/${methodName}`);
      }

      const ctx: GRPCContext = {
        metadata: new Map(Object.entries(metadata ?? {})),
        cancelled: false,
      };

      const result = await handler(request, ctx);
      return result as TRes;
    },
  };
}
