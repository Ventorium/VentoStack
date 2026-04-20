/**
 * In-memory event store with optimistic concurrency and snapshot support.
 */

export interface StoredEvent<T = unknown> {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  payload: T;
  version: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface EventStore {
  append(
    aggregateId: string,
    aggregateType: string,
    events: Array<{
      eventType: string;
      payload: unknown;
      metadata?: Record<string, unknown>;
    }>,
    expectedVersion: number,
  ): Promise<StoredEvent[]>;

  getEvents(aggregateId: string, fromVersion?: number): Promise<StoredEvent[]>;
  getLatestVersion(aggregateId: string): Promise<number>;

  saveSnapshot(aggregateId: string, state: unknown, version: number): Promise<void>;
  getSnapshot(aggregateId: string): Promise<{ state: unknown; version: number } | null>;
}

export function createMemoryEventStore(): EventStore {
  const streams = new Map<string, StoredEvent[]>();
  const snapshots = new Map<string, { state: unknown; version: number }>();

  async function append(
    aggregateId: string,
    aggregateType: string,
    events: Array<{
      eventType: string;
      payload: unknown;
      metadata?: Record<string, unknown>;
    }>,
    expectedVersion: number,
  ): Promise<StoredEvent[]> {
    const stream = streams.get(aggregateId) ?? [];
    const currentVersion = stream.length > 0 ? stream[stream.length - 1]!.version : 0;

    if (currentVersion !== expectedVersion) {
      throw new Error(
        `Concurrency conflict: expected version ${expectedVersion}, but current version is ${currentVersion}`,
      );
    }

    const stored: StoredEvent[] = [];
    let version = currentVersion;

    for (const event of events) {
      version++;
      const storedEvent: StoredEvent = {
        id: crypto.randomUUID(),
        aggregateId,
        aggregateType,
        eventType: event.eventType,
        payload: event.payload,
        version,
        timestamp: Date.now(),
        ...(event.metadata ? { metadata: event.metadata } : {}),
      };
      stream.push(storedEvent);
      stored.push(storedEvent);
    }

    streams.set(aggregateId, stream);
    return stored;
  }

  async function getEvents(aggregateId: string, fromVersion?: number): Promise<StoredEvent[]> {
    const stream = streams.get(aggregateId) ?? [];
    if (fromVersion === undefined) return [...stream];
    return stream.filter((e) => e.version >= fromVersion);
  }

  async function getLatestVersion(aggregateId: string): Promise<number> {
    const stream = streams.get(aggregateId);
    if (!stream || stream.length === 0) return 0;
    return stream[stream.length - 1]!.version;
  }

  async function saveSnapshot(aggregateId: string, state: unknown, version: number): Promise<void> {
    snapshots.set(aggregateId, { state, version });
  }

  async function getSnapshot(aggregateId: string): Promise<{ state: unknown; version: number } | null> {
    return snapshots.get(aggregateId) ?? null;
  }

  return { append, getEvents, getLatestVersion, saveSnapshot, getSnapshot };
}
