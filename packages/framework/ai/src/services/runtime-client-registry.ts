import { createAgentRuntimeClient } from '../agent-runtime/client';
import type { RuntimePackageBindings } from '../agent-runtime/client';
import type { AgentRuntimeClient } from '../agent-runtime/types';
import type { RuntimeHostService } from './runtime-host';

export interface RuntimeClientRegistry {
  get(hostId: string): Promise<AgentRuntimeClient>;
  invalidate(hostId: string): void;
  clear(): void;
}

export function createRuntimeClientRegistry(deps: {
  hostService: RuntimeHostService;
  bindings: RuntimePackageBindings;
  timeoutMs: number;
}): RuntimeClientRegistry {
  const clients = new Map<string, AgentRuntimeClient>();

  return {
    async get(hostId): Promise<AgentRuntimeClient> {
      const cached = clients.get(hostId);
      if (cached) return cached;
      const connection = await deps.hostService.resolveConnection(hostId);
      const client = createAgentRuntimeClient(
        {
          baseUrl: connection.baseUrl,
          token: connection.token,
          timeoutMs: deps.timeoutMs,
        },
        deps.bindings,
      );
      clients.set(hostId, client);
      return client;
    },
    invalidate(hostId): void {
      clients.delete(hostId);
    },
    clear(): void {
      clients.clear();
    },
  };
}
