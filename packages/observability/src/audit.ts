// @aeron/observability - 审计日志

export interface AuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  resource: string;
  resourceId?: string;
  result: "success" | "failure" | "denied";
  metadata?: Record<string, unknown>;
  previousHash?: string;
  hash: string;
}

export interface AuditStore {
  append(
    entry: Omit<AuditEntry, "id" | "timestamp" | "hash" | "previousHash">,
  ): Promise<AuditEntry>;
  query(filter: {
    actor?: string;
    action?: string;
    resource?: string;
    from?: number;
    to?: number;
    limit?: number;
  }): Promise<AuditEntry[]>;
  verify(): Promise<{ valid: boolean; brokenAt?: number }>;
}

async function computeHash(
  previousHash: string | undefined,
  timestamp: number,
  actor: string,
  action: string,
  resource: string,
  result: string,
): Promise<string> {
  const payload = `${previousHash ?? ""}${timestamp}${actor}${action}${resource}${result}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(payload);
  return hasher.digest("hex");
}

export function createAuditLog(): AuditStore {
  const entries: AuditEntry[] = [];

  return {
    async append(input): Promise<AuditEntry> {
      const id = crypto.randomUUID();
      const timestamp = Date.now();
      const previousHash =
        entries.length > 0 ? entries[entries.length - 1]!.hash : undefined;

      const hash = await computeHash(
        previousHash,
        timestamp,
        input.actor,
        input.action,
        input.resource,
        input.result,
      );

      const entry: AuditEntry = {
        id,
        timestamp,
        actor: input.actor,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        result: input.result,
        metadata: input.metadata,
        previousHash,
        hash,
      };

      entries.push(entry);
      return entry;
    },

    async query(filter): Promise<AuditEntry[]> {
      let result = entries;

      if (filter.actor !== undefined) {
        result = result.filter((e) => e.actor === filter.actor);
      }
      if (filter.action !== undefined) {
        result = result.filter((e) => e.action === filter.action);
      }
      if (filter.resource !== undefined) {
        result = result.filter((e) => e.resource === filter.resource);
      }
      if (filter.from !== undefined) {
        result = result.filter((e) => e.timestamp >= filter.from!);
      }
      if (filter.to !== undefined) {
        result = result.filter((e) => e.timestamp <= filter.to!);
      }
      if (filter.limit !== undefined) {
        result = result.slice(0, filter.limit);
      }

      return result;
    },

    async verify(): Promise<{ valid: boolean; brokenAt?: number }> {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        const previousHash = i > 0 ? entries[i - 1]!.hash : undefined;

        const expectedHash = await computeHash(
          previousHash,
          entry.timestamp,
          entry.actor,
          entry.action,
          entry.resource,
          entry.result,
        );

        if (entry.hash !== expectedHash) {
          return { valid: false, brokenAt: i };
        }

        if (entry.previousHash !== previousHash) {
          return { valid: false, brokenAt: i };
        }
      }

      return { valid: true };
    },
  };
}
