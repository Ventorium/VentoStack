import { describe, expect, test } from "bun:test";
import { createAuthSessionManager } from "../auth-session";
import { createJWT } from "../jwt";
import { createMultiDeviceManager } from "../multi-device";
import { createMemorySessionStore, createSessionManager } from "../session";
import { createTokenRefresh } from "../token-refresh";

const SECRET = "a]3Kf9$mPqR7wXyZ!bNcDe2GhJkLs5Tv"; // 32+ bytes

describe("createAuthSessionManager", () => {
  function setup() {
    const jwt = createJWT();
    const store = createMemorySessionStore();
    const sessionManager = createSessionManager(store);
    const deviceManager = createMultiDeviceManager();
    const tokenRefresh = createTokenRefresh(jwt);
    const authSession = createAuthSessionManager({
      sessionManager,
      deviceManager,
      tokenRefresh,
      jwt,
      jwtSecret: SECRET,
    });

    return { jwt, store, sessionManager, deviceManager, tokenRefresh, authSession };
  }

  test("login creates session + device + tokens", async () => {
    const { authSession, sessionManager, deviceManager } = setup();

    const result = await authSession.login({
      userId: "user1",
      device: {
        sessionId: "", // Will be replaced
        userId: "user1",
        deviceType: "web",
        deviceName: "Chrome",
      },
      tokenPayload: { role: "admin" },
    });

    expect(result.sessionId).toBeTruthy();
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.expiresIn).toBeGreaterThan(0);
    expect(result.refreshExpiresIn).toBeGreaterThan(0);

    // Session should exist
    const session = await sessionManager.get(result.sessionId);
    expect(session).not.toBeNull();
    expect(session!.data.userId).toBe("user1");

    // Device should be registered
    const devices = deviceManager.getSessions("user1");
    expect(devices.length).toBe(1);
    expect(devices[0]!.deviceType).toBe("web");

    // Token payload should have sub and sid
    const { jwt } = setup();
    const payload = jwt.decode(result.accessToken);
    expect(payload!.sub).toBe("user1");
    expect(payload!.sid).toBe(result.sessionId);
  });

  test("logout destroys session + device + revokes token", async () => {
    const { authSession, sessionManager, deviceManager, tokenRefresh } = setup();

    const result = await authSession.login({
      userId: "user1",
      device: {
        sessionId: "",
        userId: "user1",
        deviceType: "web",
      },
      tokenPayload: {},
    });

    // Get the refresh token JTI
    const { jwt } = setup();
    const refreshPayload = jwt.decode(result.refreshToken);
    const refreshJti = refreshPayload!.jti!;

    await authSession.logout("user1", result.sessionId, refreshJti);

    // Session should be gone
    expect(await sessionManager.get(result.sessionId)).toBeNull();

    // Device should be gone
    expect(deviceManager.getSessions("user1")).toHaveLength(0);

    // Refresh token should be revoked
    expect(await tokenRefresh.isRevoked(refreshJti)).toBe(true);
  });

  test("forceLogout destroys everything for a user", async () => {
    const { authSession, sessionManager, deviceManager, tokenRefresh, jwt } = setup();

    // Login on multiple devices
    const r1 = await authSession.login({
      userId: "user1",
      device: { sessionId: "", userId: "user1", deviceType: "web" },
      tokenPayload: {},
    });
    const r2 = await authSession.login({
      userId: "user1",
      device: { sessionId: "", userId: "user1", deviceType: "ios" },
      tokenPayload: {},
    });

    const result = await authSession.forceLogout("user1");

    expect(result.sessions).toBe(2);
    expect(result.devices).toBe(2);

    // Sessions should be gone
    expect(await sessionManager.get(r1.sessionId)).toBeNull();
    expect(await sessionManager.get(r2.sessionId)).toBeNull();

    // Devices should be gone
    expect(deviceManager.getSessions("user1")).toHaveLength(0);

    // Refresh tokens should be revoked
    const jti1 = jwt.decode(r1.refreshToken)!.jti!;
    const jti2 = jwt.decode(r2.refreshToken)!.jti!;
    expect(await tokenRefresh.isRevoked(jti1)).toBe(true);
    expect(await tokenRefresh.isRevoked(jti2)).toBe(true);
  });

  test("forceLogout after login invalidates tokens", async () => {
    const { authSession, tokenRefresh, jwt } = setup();

    const result = await authSession.login({
      userId: "user1",
      device: { sessionId: "", userId: "user1", deviceType: "web" },
      tokenPayload: {},
    });

    await authSession.forceLogout("user1");

    // Trying to refresh with the old token should fail
    await expect(tokenRefresh.refresh(result.refreshToken, SECRET)).rejects.toThrow("令牌已被撤销");
  });

  test("refreshTokens returns new pair and revokes old", async () => {
    const { authSession, tokenRefresh, jwt } = setup();

    const result = await authSession.login({
      userId: "user1",
      device: { sessionId: "", userId: "user1", deviceType: "web" },
      tokenPayload: {},
    });

    const newPair = await authSession.refreshTokens(result.refreshToken, SECRET);

    expect(newPair.accessToken).toBeTruthy();
    expect(newPair.refreshToken).toBeTruthy();
    expect(newPair.accessToken).not.toBe(result.accessToken);
    expect(newPair.refreshToken).not.toBe(result.refreshToken);

    // Old refresh token should be revoked
    const oldJti = jwt.decode(result.refreshToken)!.jti!;
    expect(await tokenRefresh.isRevoked(oldJti)).toBe(true);
  });

  test("negative: logout with invalid sessionId still succeeds", async () => {
    const { authSession } = setup();

    // Should not throw
    await authSession.logout("user1", "nonexistent-session-id");
  });

  test("negative: forceLogout with no sessions returns 0", async () => {
    const { authSession } = setup();

    const result = await authSession.forceLogout("nonexistent-user");
    expect(result.sessions).toBe(0);
    expect(result.devices).toBe(0);
  });

  test("forceLogout does not affect other users", async () => {
    const { authSession, sessionManager, deviceManager } = setup();

    // Login user1 and user2
    const r1 = await authSession.login({
      userId: "user1",
      device: { sessionId: "", userId: "user1", deviceType: "web" },
      tokenPayload: {},
    });
    await authSession.login({
      userId: "user2",
      device: { sessionId: "", userId: "user2", deviceType: "web" },
      tokenPayload: {},
    });

    await authSession.forceLogout("user1");

    // user1's session should be gone
    expect(await sessionManager.get(r1.sessionId)).toBeNull();

    // user2 should still have sessions
    expect(deviceManager.getSessions("user2")).toHaveLength(1);
  });
});
