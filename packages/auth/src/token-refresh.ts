// @aeron/auth - JWT Token Refresh & Revocation
// Access Token 与 Refresh Token 分离，不共用密钥与生命周期

import type { JWTManager, JWTPayload } from "./jwt";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface TokenRefreshOptions {
  accessTokenTTL?: number; // 默认 900 (15分钟)
  refreshTokenTTL?: number; // 默认 604800 (7天)
  refreshSecret?: string; // 可选独立 secret，不传则用 jwt 的 secret
}

export interface TokenRefreshManager {
  generatePair(
    payload: Record<string, unknown>,
    secret: string,
  ): Promise<TokenPair>;
  refresh(refreshToken: string, secret: string): Promise<TokenPair>;
  revoke(jti: string): Promise<void>;
  isRevoked(jti: string): Promise<boolean>;
}

const DEFAULT_ACCESS_TTL = 900;
const DEFAULT_REFRESH_TTL = 604800;

export function createTokenRefresh(
  jwt: JWTManager,
  options: TokenRefreshOptions = {},
): TokenRefreshManager {
  const accessTTL = options.accessTokenTTL ?? DEFAULT_ACCESS_TTL;
  const refreshTTL = options.refreshTokenTTL ?? DEFAULT_REFRESH_TTL;
  const refreshSecret = options.refreshSecret;

  const revokedJTIs = new Set<string>();

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
    async generatePair(
      payload: Record<string, unknown>,
      secret: string,
    ): Promise<TokenPair> {
      return generatePairFromPayload(payload, secret);
    },

    async refresh(refreshToken: string, secret: string): Promise<TokenPair> {
      const decoded = await jwt.verify(refreshToken, refreshSecret ?? secret);

      if (decoded.iss !== "refresh") {
        throw new Error("Invalid token type: expected refresh token");
      }

      if (decoded.jti && revokedJTIs.has(decoded.jti)) {
        throw new Error("Token has been revoked");
      }

      // Revoke the old refresh token
      if (decoded.jti) {
        revokedJTIs.add(decoded.jti);
      }

      // Strip internal fields before generating new pair
      const { jti: _jti, iss: _iss, iat: _iat, exp: _exp, nbf: _nbf, ...payload } = decoded;

      return generatePairFromPayload(payload, secret);
    },

    async revoke(jti: string): Promise<void> {
      revokedJTIs.add(jti);
    },

    async isRevoked(jti: string): Promise<boolean> {
      return revokedJTIs.has(jti);
    },
  };
}
