/**
 * @ventostack/auth - JWT Token Refresh & Revocation
 * Access Token 与 Refresh Token 分离，不共用密钥与生命周期
 * 实现 Token 轮换机制：刷新时旧的 Refresh Token 被吊销，生成全新 Token 对
 */

import type { JWTManager, JWTPayload } from "./jwt";
import type { TokenRevocationStore } from "./token-revocation-store";
import { createMemoryRevocationStore } from "./token-revocation-store";

/**
 * Token 对结构
 * 包含访问令牌和刷新令牌及其过期时间
 */
export interface TokenPair {
  /** 访问令牌（短有效期） */
  accessToken: string;
  /** 刷新令牌（长有效期） */
  refreshToken: string;
  /** 访问令牌过期时间（秒） */
  expiresIn: number;
  /** 刷新令牌过期时间（秒） */
  refreshExpiresIn: number;
}

/**
 * Token 刷新管理器配置选项
 */
export interface TokenRefreshOptions {
  /** 访问令牌 TTL（秒），默认 900（15 分钟） */
  accessTokenTTL?: number;
  /** 刷新令牌 TTL（秒），默认 604800（7 天） */
  refreshTokenTTL?: number;
  /** 可选的独立刷新令牌密钥，不传则使用 JWT 的 secret */
  refreshSecret?: string;
  /** 外部吊销存储，不传则使用内存存储 */
  revocationStore?: TokenRevocationStore;
}

/**
 * Token 刷新管理器接口
 * 提供 Token 对的生成、刷新与吊销能力
 */
export interface TokenRefreshManager {
  /**
   * 生成新的 Access Token 与 Refresh Token 对
   * @param payload JWT 载荷数据
   * @param secret 签名密钥
   * @returns Token 对
   */
  generatePair(payload: Record<string, unknown>, secret: string): Promise<TokenPair>;

  /**
   * 用 Refresh Token 换取新的 Token 对
   * 旧的 Refresh Token 会被吊销（轮换机制）
   * @param refreshToken 刷新令牌
   * @param secret 签名密钥
   * @returns 新的 Token 对
   */
  refresh(refreshToken: string, secret: string): Promise<TokenPair>;

  /**
   * 吊销指定 JTI 的 Token
   * @param jti JWT ID
   */
  revoke(jti: string): Promise<void>;

  /**
   * 判断指定 JTI 是否已被吊销
   * @param jti JWT ID
   * @returns 已吊销返回 true，否则返回 false
   */
  isRevoked(jti: string): Promise<boolean>;
}

/** 默认访问令牌 TTL（秒） */
const DEFAULT_ACCESS_TTL = 900;
/** 默认刷新令牌 TTL（秒） */
const DEFAULT_REFRESH_TTL = 604800;

/**
 * 创建 Token 刷新管理器实例
 * 实现 Access/Refresh Token 分离、Token 轮换与吊销机制
 * @param jwt JWT 管理器实例
 * @param options Token 刷新配置选项
 * @returns Token 刷新管理器实例
 */
export function createTokenRefresh(
  jwt: JWTManager,
  options: TokenRefreshOptions = {},
): TokenRefreshManager {
  const accessTTL = options.accessTokenTTL ?? DEFAULT_ACCESS_TTL;
  const refreshTTL = options.refreshTokenTTL ?? DEFAULT_REFRESH_TTL;
  const refreshSecret = options.refreshSecret;
  const revocationStore = options.revocationStore ?? createMemoryRevocationStore();

  /**
   * 根据载荷生成 Token 对
   * @param payload JWT 载荷
   * @param secret 签名密钥
   * @returns Token 对
   */
  async function generatePairFromPayload(
    payload: Record<string, unknown>,
    secret: string,
  ): Promise<TokenPair> {
    const accessJTI = crypto.randomUUID();
    const refreshJTI = crypto.randomUUID();

    const accessToken = await jwt.sign(
      { ...payload, jti: accessJTI, iss: "access" } as JWTPayload,
      secret,
      { expiresIn: accessTTL },
    );

    const refreshToken = await jwt.sign(
      { ...payload, jti: refreshJTI, iss: "refresh" } as JWTPayload,
      refreshSecret ?? secret,
      { expiresIn: refreshTTL },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTTL,
      refreshExpiresIn: refreshTTL,
    };
  }

  return {
    async generatePair(payload: Record<string, unknown>, secret: string): Promise<TokenPair> {
      return generatePairFromPayload(payload, secret);
    },

    async refresh(refreshToken: string, secret: string): Promise<TokenPair> {
      const decoded = await jwt.verify(refreshToken, refreshSecret ?? secret);

      if (decoded.iss !== "refresh") {
        throw new Error("无效的令牌类型：需要刷新令牌");
      }

      if (decoded.jti && await revocationStore.has(decoded.jti)) {
        throw new Error("令牌已被撤销");
      }

      // Revoke the old refresh token
      if (decoded.jti) {
        await revocationStore.add(decoded.jti, refreshTTL * 1000);
      }

      // Strip internal fields before generating new pair
      const { jti: _jti, iss: _iss, iat: _iat, exp: _exp, nbf: _nbf, ...payload } = decoded;

      return generatePairFromPayload(payload, secret);
    },

    async revoke(jti: string): Promise<void> {
      await revocationStore.add(jti, refreshTTL * 1000);
    },

    async isRevoked(jti: string): Promise<boolean> {
      return revocationStore.has(jti);
    },
  };
}
