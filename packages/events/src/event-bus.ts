/**
 * Type-safe event bus with ordered async handler execution.
 */

export interface EventDefinition<T = unknown> {
  name: string;
  /** @internal type marker — never set at runtime */
  _type?: T;
}

export function defineEvent<T>(name: string): EventDefinition<T> {
  return { name };
}

export type EventHandler<T = unknown> = (payload: T) => Promise<void> | void;

export interface EventBus {
  on<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void;
  once<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void;
  emit<T>(event: EventDefinition<T>, payload: T): Promise<void>;
  off<T>(event: EventDefinition<T>, handler?: EventHandler<T>): void;
  removeAll(): void;
  listenerCount(event: EventDefinition<unknown>): number;
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, EventHandler<unknown>[]>();

  function getHandlers(name: string): EventHandler<unknown>[] {
    let handlers = listeners.get(name);
    if (!handlers) {
      handlers = [];
      listeners.set(name, handlers);
    }
    return handlers;
  }

  function on<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void {
    const handlers = getHandlers(event.name);
    handlers.push(handler as EventHandler<unknown>);
    return () => {
      off(event, handler);
    };
  }

  function once<T>(event: EventDefinition<T>, handler: EventHandler<T>): () => void {
    const wrapper: EventHandler<T> = async (payload) => {
      off(event, wrapper);
      await handler(payload);
    };
    return on(event, wrapper);
  }

  async function emit<T>(event: EventDefinition<T>, payload: T): Promise<void> {
    const handlers = listeners.get(event.name);
    if (!handlers || handlers.length === 0) return;

    // snapshot to avoid mutation during iteration
    const snapshot = [...handlers];
    const errors: unknown[] = [];

    for (const handler of snapshot) {
      try {
        await handler(payload);
      } catch (err) {
        errors.push(err);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} handler(s) failed for event "${event.name}"`);
    }
  }

  function off<T>(event: EventDefinition<T>, handler?: EventHandler<T>): void {
    if (!handler) {
      listeners.delete(event.name);
      return;
    }
    const handlers = listeners.get(event.name);
    if (!handlers) return;
    const idx = handlers.indexOf(handler as EventHandler<unknown>);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
    if (handlers.length === 0) {
      listeners.delete(event.name);
    }
  }

  function removeAll(): void {
    listeners.clear();
  }

  function listenerCount(event: EventDefinition<unknown>): number {
    return listeners.get(event.name)?.length ?? 0;
  }

  return { on, once, emit, off, removeAll, listenerCount };
}
