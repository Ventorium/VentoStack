/**
 * @ventostack/auth - Session 管理
 * 提供基于 SessionStore 抽象的 Session 创建、查询、更新、销毁与续期能力
 * 内置内存存储实现，支持 TTL 过期检查与键前缀隔离
 */

/**
 * Session 数据结构
 */
export interface Session {
  /** Session 唯一标识 */
  id: string;
  /** Session 关联的用户数据 */
  data: Record<string, unknown>;
  /** Session 过期时间戳（毫秒） */
  expiresAt: number;
}

/**
 * Session 管理器配置选项
 */
export interface SessionOptions {
  /** Session 默认 TTL（秒），默认 3600 */
  ttl?: number;
  /** 存储键前缀，默认 "session:" */
  prefix?: string;
  /** Cookie 名称，默认 "sid" */
  cookieName?: string;
}

/**
 * Session 存储接口
 * 定义底层存储（如 Redis、内存、数据库）必须实现的操作契约
 */
export interface SessionStore {
  /**
   * 根据 Session ID 获取 Session
   * @param id Session ID
   * @returns Session 对象，不存在或已过期返回 null
   */
  get(id: string): Promise<Session | null>;

  /**
   * 保存 Session
   * @param session Session 对象
   */
  set(session: Session): Promise<void>;

  /**
   * 删除 Session
   * @param id Session ID
   */
  delete(id: string): Promise<void>;

  /**
   * 延长 Session 过期时间（续期）
   * @param id Session ID
   * @param ttl 续期时长（秒）
   */
  touch(id: string, ttl: number): Promise<void>;

  /**
   * 删除指定用户的所有 Session
   * @param userId 用户 ID
   * @returns 删除的 Session 数量
   */
  deleteByUser?(userId: string): Promise<number>;
}

/**
 * Session 管理器接口
 * 提供 Session 的创建、查询、更新、销毁与续期能力
 */
export interface SessionManager {
  /**
   * 创建新 Session
   * @param data 可选的初始用户数据
   * @returns 新创建的 Session 对象
   */
  create(data?: Record<string, unknown>): Promise<Session>;

  /**
   * 根据 Session ID 获取 Session
   * @param id Session ID
   * @returns Session 对象，不存在或已过期返回 null
   */
  get(id: string): Promise<Session | null>;

  /**
   * 更新 Session 数据（合并更新）
   * @param id Session ID
   * @param data 要合并的数据
   */
  update(id: string, data: Record<string, unknown>): Promise<void>;

  /**
   * 销毁 Session
   * @param id Session ID
   */
  destroy(id: string): Promise<void>;

  /**
   * 续期 Session 过期时间
   * @param id Session ID
   */
  touch(id: string): Promise<void>;

  /**
   * 销毁指定用户的所有 Session
   * @param userId 用户 ID
   * @returns 销毁的 Session 数量
   */
  destroyByUser(userId: string): Promise<number>;
}

/** 默认 Session TTL（秒） */
const DEFAULT_TTL = 3600;
/** 默认存储键前缀 */
const DEFAULT_PREFIX = "session:";
/** 默认 Cookie 名称 */
const DEFAULT_COOKIE_NAME = "sid";

/**
 * 创建内存 Session 存储实例
 * 基于 Map 实现，支持 TTL 过期检查
 * @returns 内存 Session 存储实例
 */
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
        if (session.expiresAt <= Date.now()) {
          sessions.delete(id);
          return;
        }
        session.expiresAt = Date.now() + ttl * 1000;
      }
    },
  };
}

/**
 * 创建 Session 管理器实例
 * @param store Session 存储实例
 * @param options Session 配置选项
 * @returns Session 管理器实例
 */
export function createSessionManager(
  store: SessionStore,
  options: SessionOptions = {},
): SessionManager {
  const ttl = options.ttl ?? DEFAULT_TTL;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const _cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;

  // Whether the store manages its own user-session index (e.g. Redis via sadd/smembers).
  // When true, we skip the in-memory index entirely — it would be stale in a
  // multi-instance deployment since other instances create sessions invisible to
  // this process's local Map.
  const storeHasUserIndex = typeof store.deleteByUser === "function";

  // userId -> Set<sessionId> in-memory index — only used as fallback when the
  // store does NOT provide deleteByUser (i.e. MemorySessionStore).
  const userSessions = new Map<string, Set<string>>();

  /**
   * 为 Session ID 添加前缀
   * @param id 原始 Session ID
   * @returns 带前缀的存储键
   */
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

      // Only maintain the in-memory index when the store does not manage its own
      // user-session mapping. Redis stores track this via sadd on a per-user set
      // key, which is visible to all instances.
      if (!storeHasUserIndex) {
        const userId = data.userId as string | undefined;
        if (userId) {
          let sessions = userSessions.get(userId);
          if (!sessions) {
            sessions = new Set();
            userSessions.set(userId, sessions);
          }
          sessions.add(id);
        }
      }

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

      // Only clean up the in-memory index when we are actually using it.
      if (!storeHasUserIndex) {
        for (const [, sessionIds] of userSessions) {
          if (sessionIds.has(id)) {
            sessionIds.delete(id);
            break;
          }
        }
      }
    },

    async touch(id: string): Promise<void> {
      await store.touch(prefixedId(id), ttl);
    },

    async destroyByUser(userId: string): Promise<number> {
      // If the store provides deleteByUser, delegate entirely to it. This is
      // the distributed-safe path — the store (e.g. Redis) has a global view of
      // all sessions across instances.
      if (store.deleteByUser) {
        return store.deleteByUser(userId);
      }

      // Fallback: use the local in-memory index (single-instance / test setup).
      const sessionIds = userSessions.get(userId);
      if (!sessionIds || sessionIds.size === 0) {
        return 0;
      }

      let count = 0;
      for (const sessionId of sessionIds) {
        await store.delete(prefixedId(sessionId));
        count++;
      }
      userSessions.delete(userId);
      return count;
    },
  };
}
