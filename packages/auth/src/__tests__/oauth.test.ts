import { describe, test, expect, mock, beforeEach } from "bun:test";
import { createOAuth } from "../oauth";
import type { OAuthProvider } from "../oauth";

const testProvider: OAuthProvider = {
  name: "test",
  authorizationURL: "https://auth.example.com/authorize",
  tokenURL: "https://auth.example.com/token",
  userInfoURL: "https://auth.example.com/userinfo",
  clientId: "client-123",
  clientSecret: "secret-456",
  scopes: ["openid", "email"],
  redirectURL: "https://app.example.com/callback",
};

describe("createOAuth", () => {
  const oauth = createOAuth();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("getAuthorizationURL builds correct URL with all params", () => {
    const url = oauth.getAuthorizationURL(testProvider, "state-abc");
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://auth.example.com/authorize",
    );
    expect(parsed.searchParams.get("client_id")).toBe("client-123");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/callback",
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("scope")).toBe("openid email");
  });

  test("getAuthorizationURL omits scope when empty", () => {
    const provider = { ...testProvider, scopes: [] };
    const url = oauth.getAuthorizationURL(provider, "state-1");
    const parsed = new URL(url);
    expect(parsed.searchParams.has("scope")).toBe(false);
  });

  test("exchangeCode sends POST and returns token response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "at-123",
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "rt-456",
            scope: "openid email",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as typeof fetch;

    const result = await oauth.exchangeCode(testProvider, "code-abc");
    expect(result.accessToken).toBe("at-123");
    expect(result.tokenType).toBe("bearer");
    expect(result.expiresIn).toBe(3600);
    expect(result.refreshToken).toBe("rt-456");
    expect(result.scope).toBe("openid email");
  });

  test("exchangeCode throws on non-ok response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Bad Request", { status: 400, statusText: "Bad Request" })),
    ) as typeof fetch;

    await expect(
      oauth.exchangeCode(testProvider, "bad-code"),
    ).rejects.toThrow("OAuth token exchange failed");
  });

  test("getUserInfo returns parsed user info", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "user-1",
            email: "user@example.com",
            name: "Test User",
            avatar_url: "https://example.com/avatar.png",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as typeof fetch;

    const info = await oauth.getUserInfo(testProvider, "at-123");
    expect(info.id).toBe("user-1");
    expect(info.email).toBe("user@example.com");
    expect(info.name).toBe("Test User");
    expect(info.avatar).toBe("https://example.com/avatar.png");
    expect(info.raw.id).toBe("user-1");
  });

  test("getUserInfo throws when provider has no userInfoURL", async () => {
    const provider = { ...testProvider, userInfoURL: undefined };
    await expect(oauth.getUserInfo(provider, "at-123")).rejects.toThrow(
      "does not have a userInfoURL",
    );
  });

  test("getUserInfo throws on non-ok response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Unauthorized", { status: 401, statusText: "Unauthorized" })),
    ) as typeof fetch;

    await expect(
      oauth.getUserInfo(testProvider, "bad-token"),
    ).rejects.toThrow("OAuth user info request failed");
  });

  test("github returns correctly configured provider", () => {
    const provider = oauth.github({
      clientId: "gh-id",
      clientSecret: "gh-secret",
      redirectURL: "https://app.com/cb",
    });
    expect(provider.name).toBe("github");
    expect(provider.authorizationURL).toContain("github.com");
    expect(provider.tokenURL).toContain("github.com");
    expect(provider.userInfoURL).toContain("api.github.com");
    expect(provider.clientId).toBe("gh-id");
    expect(provider.scopes).toContain("read:user");
  });

  test("google returns correctly configured provider", () => {
    const provider = oauth.google({
      clientId: "goog-id",
      clientSecret: "goog-secret",
      redirectURL: "https://app.com/cb",
    });
    expect(provider.name).toBe("google");
    expect(provider.authorizationURL).toContain("accounts.google.com");
    expect(provider.tokenURL).toContain("googleapis.com");
    expect(provider.userInfoURL).toContain("googleapis.com");
    expect(provider.clientId).toBe("goog-id");
    expect(provider.scopes).toContain("openid");
  });
});
