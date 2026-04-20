// @aeron/auth - 多端登录支持

export interface DeviceSession {
  sessionId: string;
  userId: string;
  deviceType: string;
  deviceName?: string;
  ip?: string;
  userAgent?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface MultiDeviceOptions {
  /** 每个用户最大设备数 */
  maxDevices?: number;
  /** 设备类型（用于区分端） */
  deviceTypes?: string[];
  /** 每种设备类型最大数 */
  maxPerType?: number;
  /** 超出限制时的策略 */
  overflowStrategy?: "reject" | "kick-oldest";
}

export interface MultiDeviceManager {
  login(userId: string, device: Omit<DeviceSession, "createdAt" | "lastActiveAt">): Promise<{ allowed: boolean; kicked?: string[] }>;
  logout(userId: string, sessionId: string): void;
  logoutAll(userId: string): void;
  getSessions(userId: string): DeviceSession[];
  getActiveDeviceCount(userId: string): number;
  touch(userId: string, sessionId: string): void;
  isSessionValid(userId: string, sessionId: string): boolean;
}

/**
 * 创建多端登录管理器
 */
export function createMultiDeviceManager(options?: MultiDeviceOptions): MultiDeviceManager {
  const maxDevices = options?.maxDevices ?? 5;
  const maxPerType = options?.maxPerType ?? 2;
  const overflowStrategy = options?.overflowStrategy ?? "kick-oldest";

  // userId -> sessions
  const userSessions = new Map<string, Map<string, DeviceSession>>();

  function getOrCreateUserMap(userId: string): Map<string, DeviceSession> {
    let sessions = userSessions.get(userId);
    if (!sessions) {
      sessions = new Map();
      userSessions.set(userId, sessions);
    }
    return sessions;
  }

  return {
    async login(userId: string, device: Omit<DeviceSession, "createdAt" | "lastActiveAt">): Promise<{ allowed: boolean; kicked?: string[] }> {
      const sessions = getOrCreateUserMap(userId);
      const kicked: string[] = [];

      // 检查同设备类型限制
      const sameTypeCount = Array.from(sessions.values()).filter(
        (s) => s.deviceType === device.deviceType,
      ).length;

      if (sameTypeCount >= maxPerType) {
        if (overflowStrategy === "reject") {
          return { allowed: false };
        }
        // kick oldest of same type
        const sameType = Array.from(sessions.values())
          .filter((s) => s.deviceType === device.deviceType)
          .sort((a, b) => a.lastActiveAt - b.lastActiveAt);
        const toKick = sameType.slice(0, sameTypeCount - maxPerType + 1);
        for (const s of toKick) {
          sessions.delete(s.sessionId);
          kicked.push(s.sessionId);
        }
      }

      // 检查总设备数限制
      if (sessions.size >= maxDevices) {
        if (overflowStrategy === "reject") {
          return { allowed: false };
        }
        const all = Array.from(sessions.values()).sort((a, b) => a.lastActiveAt - b.lastActiveAt);
        const toKick = all.slice(0, sessions.size - maxDevices + 1);
        for (const s of toKick) {
          sessions.delete(s.sessionId);
          if (!kicked.includes(s.sessionId)) kicked.push(s.sessionId);
        }
      }

      const now = Date.now();
      sessions.set(device.sessionId, {
        ...device,
        createdAt: now,
        lastActiveAt: now,
      });

      return { allowed: true, kicked: kicked.length > 0 ? kicked : undefined };
    },

    logout(userId: string, sessionId: string): void {
      const sessions = userSessions.get(userId);
      if (sessions) sessions.delete(sessionId);
    },

    logoutAll(userId: string): void {
      userSessions.delete(userId);
    },

    getSessions(userId: string): DeviceSession[] {
      const sessions = userSessions.get(userId);
      if (!sessions) return [];
      return Array.from(sessions.values());
    },

    getActiveDeviceCount(userId: string): number {
      return userSessions.get(userId)?.size ?? 0;
    },

    touch(userId: string, sessionId: string): void {
      const sessions = userSessions.get(userId);
      const session = sessions?.get(sessionId);
      if (session) session.lastActiveAt = Date.now();
    },

    isSessionValid(userId: string, sessionId: string): boolean {
      const sessions = userSessions.get(userId);
      return sessions?.has(sessionId) ?? false;
    },
  };
}
