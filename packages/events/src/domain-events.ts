/**
 * Domain event registry — ORM lifecycle hook style.
 */

export type DomainEventType =
  | "beforeCreate"
  | "afterCreate"
  | "beforeUpdate"
  | "afterUpdate"
  | "beforeDelete"
  | "afterDelete";

export interface DomainEvent<T = unknown> {
  type: DomainEventType;
  entity: string;
  payload: T;
  timestamp: number;
}

export type DomainEventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void;

export interface DomainEventRegistry {
  register<T>(entity: string, type: DomainEventType, handler: DomainEventHandler<T>): () => void;
  trigger<T>(entity: string, type: DomainEventType, payload: T): Promise<void>;
  listHandlers(entity: string, type?: DomainEventType): number;
  removeAll(entity?: string): void;
}

export function createDomainEventRegistry(): DomainEventRegistry {
  // key format: "entity:type"
  const handlers = new Map<string, DomainEventHandler<unknown>[]>();

  function makeKey(entity: string, type: DomainEventType): string {
    return `${entity}:${type}`;
  }

  function register<T>(
    entity: string,
    type: DomainEventType,
    handler: DomainEventHandler<T>,
  ): () => void {
    const key = makeKey(entity, type);
    let list = handlers.get(key);
    if (!list) {
      list = [];
      handlers.set(key, list);
    }
    list.push(handler as DomainEventHandler<unknown>);

    return () => {
      const current = handlers.get(key);
      if (!current) return;
      const idx = current.indexOf(handler as DomainEventHandler<unknown>);
      if (idx !== -1) {
        current.splice(idx, 1);
      }
      if (current.length === 0) {
        handlers.delete(key);
      }
    };
  }

  async function trigger<T>(entity: string, type: DomainEventType, payload: T): Promise<void> {
    const key = makeKey(entity, type);
    const list = handlers.get(key);
    if (!list || list.length === 0) return;

    const event: DomainEvent<T> = {
      type,
      entity,
      payload,
      timestamp: Date.now(),
    };

    const errors: unknown[] = [];
    for (const handler of [...list]) {
      try {
        await handler(event as DomainEvent<unknown>);
      } catch (err) {
        errors.push(err);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `${errors.length} handler(s) failed for domain event "${key}"`,
      );
    }
  }

  function listHandlers(entity: string, type?: DomainEventType): number {
    if (type !== undefined) {
      return handlers.get(makeKey(entity, type))?.length ?? 0;
    }
    // Count across all event types for this entity
    let count = 0;
    for (const [key, list] of handlers) {
      if (key.startsWith(`${entity}:`)) {
        count += list.length;
      }
    }
    return count;
  }

  function removeAll(entity?: string): void {
    if (entity === undefined) {
      handlers.clear();
      return;
    }
    const prefix = `${entity}:`;
    for (const key of [...handlers.keys()]) {
      if (key.startsWith(prefix)) {
        handlers.delete(key);
      }
    }
  }

  return { register, trigger, listHandlers, removeAll };
}
