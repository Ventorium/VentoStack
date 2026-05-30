/**
 * @ventostack/auth - Unified Auth Session Manager
 * 统一管理 Session、设备登录、Token 生命周期
 * 提供完整的登录、登出、强制登出与 Token 刷新能力
 */

import type { JWTManager } from "./jwt";
import type { DeviceSession, MultiDeviceManager } from "./multi-device";
import type { SessionManager } from "./session";
import type { TokenPair, TokenRefreshManager } from "./token-refresh";

/**
 * 统一认证会话管理器接口
 * 聚合 Session、多端设备、Token 刷新三大能力
 */
export interface AuthSessionManager {
  /**
   * 用户登录：创建 Session + 注册设备 + 生成 Token 对
   * @param params 登录参数
   * @returns Session ID、Token 对与过期时间
   */
  login(params: {
    userId: string;
    device: Omit<DeviceSession, "createdAt" | "lastActiveAt">;
    tokenPayload: Record<string, unknown>;
    sessionData?: Record<string, unknown>;
  }): Promise<{
    sessionId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }>;

  /**
   * 用户登出：销毁 Session + 移除设备 + 吊销 Refresh Token
   * @param userId 用户 ID
   * @param sessionId Session ID
   * @param refreshTokenJti 可选的 Refresh Token JTI，提供时吊销该 Token
   */
  logout(userId: string, sessionId: string, refreshTokenJti?: string): Promise<void>;

  /**
   * 强制登出用户的所有设备与 Session
   * @param userId 用户 ID
   * @returns 销毁的 Session 数量和设备数量
   */
  forceLogout(userId: string): Promise<{ sessions: number; devices: number }>;

  /**
   * 用 Refresh Token 换取新的 Token 对
   * 同时更新 Session 和设备的活跃状态
   * @param refreshToken 刷新令牌
   * @param secret 签名密钥
   * @returns 新的 Token 对
   */
  refreshTokens(refreshToken: string, secret: string): Promise<TokenPair>;
}

/**
 * 创建统一认证会话管理器
 * @param deps 依赖项
 * @returns 认证会话管理器实例
 */
export function createAuthSessionManager(deps: {
  sessionManager: SessionManager;
  deviceManager: MultiDeviceManager;
  tokenRefresh: TokenRefreshManager;
  jwt: JWTManager;
  jwtSecret: string;
  jwtOptions?: { expiresIn?: number; algorithm?: string };
}): AuthSessionManager {
  const { sessionManager, deviceManager, tokenRefresh, jwt, jwtSecret, jwtOptions } = deps;

  // userId -> Set<jti> index for tracking refresh token JTIs during forceLogout
  const userRefreshTokens = new Map<string, Set<string>>();

  return {
    async login(params) {
      const { userId, device, tokenPayload, sessionData } = params;

      // 1. Create session
      const session = await sessionManager.create({
        ...sessionData,
        userId,
      });

      // 2. Register device
      const deviceResult = await deviceManager.login(userId, {
        ...device,
        sessionId: session.id,
      });

      // Handle kicked devices - revoke their sessions
      if (deviceResult.kicked && deviceResult.kicked.length > 0) {
        for (const kickedSessionId of deviceResult.kicked) {
          await sessionManager.destroy(kickedSessionId);
        }
      }

      // 3. Generate token pair
      const pair = await tokenRefresh.generatePair(
        { ...tokenPayload, sub: userId, sid: session.id },
        jwtSecret,
      );

      // 4. Track refresh token JTI for forceLogout
      const refreshPayload = jwt.decode(pair.refreshToken);
      if (refreshPayload?.jti) {
        let jtis = userRefreshTokens.get(userId);
        if (!jtis) {
          jtis = new Set();
          userRefreshTokens.set(userId, jtis);
        }
        jtis.add(refreshPayload.jti);
      }

      return {
        sessionId: session.id,
        accessToken: pair.accessToken,
        refreshToken: pair.refreshToken,
        expiresIn: pair.expiresIn,
        refreshExpiresIn: pair.refreshExpiresIn,
      };
    },

    async logout(userId: string, sessionId: string, refreshTokenJti?: string) {
      // 1. Destroy session (ignores if not found)
      await sessionManager.destroy(sessionId);

      // 2. Remove device
      deviceManager.logout(userId, sessionId);

      // 3. Revoke refresh token if JTI provided
      if (refreshTokenJti) {
        await tokenRefresh.revoke(refreshTokenJti);

        // Clean up from tracking index
        const jtis = userRefreshTokens.get(userId);
        if (jtis) {
          jtis.delete(refreshTokenJti);
        }
      }
    },

    async forceLogout(userId: string) {
      // 1. Get all device sessions before clearing
      const devices = deviceManager.getSessions(userId);
      const deviceCount = devices.length;

      // 2. Destroy all sessions
      const sessionCount = await sessionManager.destroyByUser(userId);

      // 3. Logout all devices
      deviceManager.logoutAll(userId);

      // 4. Revoke all tracked refresh token JTIs
      const jtis = userRefreshTokens.get(userId);
      if (jtis) {
        for (const jti of jtis) {
          await tokenRefresh.revoke(jti);
        }
        userRefreshTokens.delete(userId);
      }

      return { sessions: sessionCount, devices: deviceCount };
    },

    async refreshTokens(refreshToken: string, secret: string) {
      const pair = await tokenRefresh.refresh(refreshToken, secret);

      // Track new refresh token JTI
      const newRefreshPayload = jwt.decode(pair.refreshToken);
      const userId = newRefreshPayload?.sub as string | undefined;
      if (userId && newRefreshPayload?.jti) {
        let jtis = userRefreshTokens.get(userId);
        if (!jtis) {
          jtis = new Set();
          userRefreshTokens.set(userId, jtis);
        }
        jtis.add(newRefreshPayload.jti);
      }

      // Update session/device activity if sid is present
      const sessionId = newRefreshPayload?.sid as string | undefined;
      if (userId && sessionId) {
        await sessionManager.touch(sessionId);
        deviceManager.touch(userId, sessionId);
      }

      return pair;
    },
  };
}
