import { describe, test, expect } from "bun:test";
import { createTokenRefresh } from "../token-refresh";
import { createJWT } from "../jwt";

const SECRET = "a]3Kf9$mPqR7wXyZ!bNcDe2GhJkLs5Tv"; // 32+ bytes
const REFRESH_SECRET = "x9Y!kLm2NpQr3StUvWxYz4AbCdEfGhJk"; // separate 32+ bytes

describe("createTokenRefresh", () => {
  const jwt = createJWT();

  test("generatePair returns accessToken and refreshToken", async () => {
    const manager = createTokenRefresh(jwt);
    const pair = await manager.generatePair({ sub: "user1" }, SECRET);
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    expect(pair.expiresIn).toBe(900);
    expect(pair.refreshExpiresIn).toBe(604800);
  });

  test("accessToken has iss=access and refreshToken has iss=refresh", async () => {
    const manager = createTokenRefresh(jwt);
    const pair = await manager.generatePair({ sub: "user1" }, SECRET);
    const access = jwt.decode(pair.accessToken)!;
    const refresh = jwt.decode(pair.refreshToken)!;
    expect(access.iss).toBe("access");
    expect(refresh.iss).toBe("refresh");
  });

  test("tokens contain jti", async () => {
    const manager = createTokenRefresh(jwt);
    const pair = await manager.generatePair({ sub: "user1" }, SECRET);
    const access = jwt.decode(pair.accessToken)!;
    const refresh = jwt.decode(pair.refreshToken)!;
    expect(access.jti).toBeTruthy();
    expect(refresh.jti).toBeTruthy();
    expect(access.jti).not.toBe(refresh.jti);
  });

  test("refresh returns a new token pair", async () => {
    const manager = createTokenRefresh(jwt);
    const pair1 = await manager.generatePair({ sub: "user1" }, SECRET);
    const pair2 = await manager.refresh(pair1.refreshToken, SECRET);
    expect(pair2.accessToken).toBeTruthy();
    expect(pair2.refreshToken).toBeTruthy();
    expect(pair2.accessToken).not.toBe(pair1.accessToken);
    expect(pair2.refreshToken).not.toBe(pair1.refreshToken);
  });

  test("refresh rejects access token (wrong iss)", async () => {
    const manager = createTokenRefresh(jwt);
    const pair = await manager.generatePair({ sub: "user1" }, SECRET);
    await expect(manager.refresh(pair.accessToken, SECRET)).rejects.toThrow(
      "Invalid token type",
    );
  });

  test("revoke and isRevoked work correctly", async () => {
    const manager = createTokenRefresh(jwt);
    const jti = "test-jti-123";
    expect(await manager.isRevoked(jti)).toBe(false);
    await manager.revoke(jti);
    expect(await manager.isRevoked(jti)).toBe(true);
  });

  test("refresh rejects revoked token", async () => {
    const manager = createTokenRefresh(jwt);
    const pair = await manager.generatePair({ sub: "user1" }, SECRET);
    const refreshPayload = jwt.decode(pair.refreshToken)!;
    await manager.revoke(refreshPayload.jti!);
    await expect(manager.refresh(pair.refreshToken, SECRET)).rejects.toThrow(
      "Token has been revoked",
    );
  });

  test("old refresh token is revoked after refresh", async () => {
    const manager = createTokenRefresh(jwt);
    const pair1 = await manager.generatePair({ sub: "user1" }, SECRET);
    const oldJTI = jwt.decode(pair1.refreshToken)!.jti!;
    await manager.refresh(pair1.refreshToken, SECRET);
    expect(await manager.isRevoked(oldJTI)).toBe(true);
  });

  test("supports custom TTL", async () => {
    const manager = createTokenRefresh(jwt, {
      accessTokenTTL: 60,
      refreshTokenTTL: 3600,
    });
    const pair = await manager.generatePair({ sub: "user1" }, SECRET);
    expect(pair.expiresIn).toBe(60);
    expect(pair.refreshExpiresIn).toBe(3600);
  });

  test("supports separate refresh secret", async () => {
    const manager = createTokenRefresh(jwt, {
      refreshSecret: REFRESH_SECRET,
    });
    const pair = await manager.generatePair({ sub: "user1" }, SECRET);
    // Refresh token should be verifiable with refresh secret
    const decoded = await jwt.verify(pair.refreshToken, REFRESH_SECRET);
    expect(decoded.iss).toBe("refresh");
    // Refresh should work
    const pair2 = await manager.refresh(pair.refreshToken, SECRET);
    expect(pair2.accessToken).toBeTruthy();
  });
});
