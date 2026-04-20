// @aeron/auth - Session 管理

export interface Session {
  id: string;
  data: Record<string, unknown>;
  expiresAt: number;
}

export interface SessionOptions {
  ttl?: number; // 秒，默认 3600
  prefix?: string; // key 前缀，默认 "session:"
  cookieName?: string; // cookie 名，默认 "sid"
}

export interface SessionStore {
  get(id: string): Promise<Session | null>;
  set(session: Session): Promise<void>;
  delete(id: string): Promise<void>;
  touch(id: string, ttl: number): Promise<void>;
}

export interface SessionManager {
  create(data?: Record<string, unknown>): Promise<Session>;
  get(id: string): Promise<Session | null>;
  update(id: string, data: Record<string, unknown>): Promise<void>;
  destroy(id: string): Promise<void>;
  touch(id: string): Promise<void>;
}

const DEFAULT_TTL = 3600;
const DEFAULT_PREFIX = "session:";
const DEFAULT_COOKIE_NAME = "sid";

export function createMemorySessionStore(): SessionStore {
  const sessions = new Map<string, Session>();

  return {
    async get(id: string): Promise<Session | null> {
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        sessions.delete(id);
        return null;
      }
      return { ...session, data: { ...session.data } };
    },

    async set(session: Session): Promise<void> {
      sessions.set(session.id, {
        ...session,
        data: { ...session.data },
      });
    },

    async delete(id: string): Promise<void> {
      sessions.delete(id);
    },

    async touch(id: string, ttl: number): Promise<void> {
      const session = sessions.get(id);
      if (session) {
        session.expiresAt = Date.now() + ttl * 1000;
      }
    },
  };
}

export function createSessionManager(
  store: SessionStore,
  options: SessionOptions = {},
): SessionManager {
  const ttl = options.ttl ?? DEFAULT_TTL;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const _cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;

  function prefixedId(id: string): string {
    return `${prefix}${id}`;
  }

  return {
    async create(data: Record<string, unknown> = {}): Promise<Session> {
      const id = crypto.randomUUID();
      const session: Session = {
        id,
        data,
        expiresAt: Date.now() + ttl * 1000,
      };
      await store.set({ ...session, id: prefixedId(id), data: { ...data } });
      return session;
    },

    async get(id: string): Promise<Session | null> {
      const session = await store.get(prefixedId(id));
      if (!session) return null;
      return { ...session, id };
    },

    async update(id: string, data: Record<string, unknown>): Promise<void> {
      const session = await store.get(prefixedId(id));
      if (!session) return;
      session.data = { ...session.data, ...data };
      await store.set({ ...session, id: prefixedId(id) });
    },

    async destroy(id: string): Promise<void> {
      await store.delete(prefixedId(id));
    },

    async touch(id: string): Promise<void> {
      await store.touch(prefixedId(id), ttl);
    },
  };
}
