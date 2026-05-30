import { describe, expect, test } from "bun:test";
import { createJWT } from "../jwt";

const SECRET_32 = "a]3Kf9$mPqR7wXyZ!bNcDe2GhJkLs5Tv"; // 32+ bytes
const SHORT_SECRET = "too-short";

describe("createJWT", () => {
  const jwt = createJWT();

  describe("sign", () => {
    test("signs a payload and returns a valid JWT string", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32);
      expect(typeof token).toBe("string");
      const parts = token.split(".");
      expect(parts.length).toBe(3);
    });

    test("auto-injects iat", async () => {
      const before = Math.floor(Date.now() / 1000);
      const token = await jwt.sign({ sub: "user1" }, SECRET_32);
      const after = Math.floor(Date.now() / 1000);
      const payload = jwt.decode(token)!;
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.iat).toBeLessThanOrEqual(after);
    });

    test("calculates exp from expiresIn", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32, {
        expiresIn: 3600,
      });
      const payload = jwt.decode(token)!;
      expect(payload.exp).toBe(payload.iat! + 3600);
    });

    test("sets issuer and audience from options", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32, {
        issuer: "test-issuer",
        audience: "test-audience",
      });
      const payload = jwt.decode(token)!;
      expect(payload.iss).toBe("test-issuer");
      expect(payload.aud).toBe("test-audience");
    });

    test("supports HS256, HS384, HS512", async () => {
      for (const alg of ["HS256", "HS384", "HS512"] as const) {
        const token = await jwt.sign({ sub: "user1" }, SECRET_32, {
          algorithm: alg,
        });
        const header = JSON.parse(atob(token.split(".")[0]!.replace(/-/g, "+").replace(/_/g, "/")));
        expect(header.alg).toBe(alg);
      }
    });

    test("throws on secret shorter than 32 bytes", async () => {
      await expect(jwt.sign({ sub: "user1" }, SHORT_SECRET)).rejects.toThrow("at least 32 bytes");
    });
  });

  describe("verify", () => {
    test("verifies a valid token", async () => {
      const token = await jwt.sign({ sub: "user1", role: "admin" }, SECRET_32);
      const payload = await jwt.verify(token, SECRET_32);
      expect(payload.sub).toBe("user1");
      expect(payload.role).toBe("admin");
    });

    test("rejects token with wrong secret", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32);
      const otherSecret = `${SECRET_32}extra-bytes-to-make-it-different`;
      await expect(jwt.verify(token, otherSecret)).rejects.toThrow("Invalid signature");
    });

    test("rejects expired token", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32, {
        expiresIn: -10,
      });
      await expect(jwt.verify(token, SECRET_32)).rejects.toThrow("Token expired");
    });

    test("rejects token before nbf", async () => {
      const future = Math.floor(Date.now() / 1000) + 9999;
      const token = await jwt.sign({ sub: "user1", nbf: future }, SECRET_32);
      await expect(jwt.verify(token, SECRET_32)).rejects.toThrow("not yet valid");
    });

    test("validates issuer", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32, {
        issuer: "issuer-a",
      });
      await expect(jwt.verify(token, SECRET_32, { issuer: "issuer-b" })).rejects.toThrow(
        "Issuer mismatch",
      );

      // Should succeed with correct issuer
      const payload = await jwt.verify(token, SECRET_32, {
        issuer: "issuer-a",
      });
      expect(payload.iss).toBe("issuer-a");
    });

    test("validates audience", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32, {
        audience: "aud-a",
      });
      await expect(jwt.verify(token, SECRET_32, { audience: "aud-b" })).rejects.toThrow(
        "Audience mismatch",
      );

      const payload = await jwt.verify(token, SECRET_32, {
        audience: "aud-a",
      });
      expect(payload.aud).toBe("aud-a");
    });

    test("rejects unsupported algorithm in token header", async () => {
      // Forge a token with alg: none
      const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const payload = btoa(JSON.stringify({ sub: "user1" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const fakeToken = `${header}.${payload}.fakesig`;

      await expect(jwt.verify(fakeToken, SECRET_32)).rejects.toThrow("不支持的算法");
    });

    test("rejects algorithm mismatch", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32, {
        algorithm: "HS256",
      });
      await expect(jwt.verify(token, SECRET_32, { algorithm: "HS512" })).rejects.toThrow(
        "算法不匹配",
      );
    });

    test("rejects malformed token", async () => {
      await expect(jwt.verify("not.a.valid.jwt", SECRET_32)).rejects.toThrow();
      await expect(jwt.verify("onlyonepart", SECRET_32)).rejects.toThrow("Invalid token format");
    });

    test("throws on secret shorter than 32 bytes", async () => {
      await expect(jwt.verify("a.b.c", SHORT_SECRET)).rejects.toThrow("at least 32 bytes");
    });

    test("verifies with all supported algorithms", async () => {
      for (const alg of ["HS256", "HS384", "HS512"] as const) {
        const token = await jwt.sign({ sub: "user1" }, SECRET_32, {
          algorithm: alg,
        });
        const payload = await jwt.verify(token, SECRET_32, {
          algorithm: alg,
        });
        expect(payload.sub).toBe("user1");
      }
    });

    test("token with typ: JWT passes verify", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32);
      // sign() always sets typ: "JWT" in header
      const payload = await jwt.verify(token, SECRET_32);
      expect(payload.sub).toBe("user1");
    });

    test("token with typ: OTHER throws error on verify", async () => {
      // Forge a token with typ: "OTHER"
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "OTHER" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const payload = btoa(JSON.stringify({ sub: "user1", iat: Math.floor(Date.now() / 1000) }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // We need a valid signature for this test
      const keyData = new TextEncoder().encode(SECRET_32);
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signingInput = `${header}.${payload}`;
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const fakeToken = `${signingInput}.${sigB64}`;

      await expect(jwt.verify(fakeToken, SECRET_32)).rejects.toThrow("无效的令牌类型");
    });

    test("token without typ field passes verify (backward compat)", async () => {
      // Forge a token without typ field
      const header = btoa(JSON.stringify({ alg: "HS256" }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const payload = btoa(JSON.stringify({ sub: "user1", iat: Math.floor(Date.now() / 1000) }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const keyData = new TextEncoder().encode(SECRET_32);
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signingInput = `${header}.${payload}`;
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const fakeToken = `${signingInput}.${sigB64}`;

      const result = await jwt.verify(fakeToken, SECRET_32);
      expect(result.sub).toBe("user1");
    });
  });

  describe("decode", () => {
    test("decodes payload without verification", async () => {
      const token = await jwt.sign({ sub: "user1", custom: "data" }, SECRET_32);
      const payload = jwt.decode(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user1");
      expect(payload!.custom).toBe("data");
    });

    test("returns null for malformed token", () => {
      expect(jwt.decode("garbage")).toBeNull();
      expect(jwt.decode("")).toBeNull();
      expect(jwt.decode("a.b")).toBeNull();
    });

    test("decodes even with invalid signature", async () => {
      const token = await jwt.sign({ sub: "user1" }, SECRET_32);
      const tampered = `${token.slice(0, -5)}XXXXX`;
      const payload = jwt.decode(tampered);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe("user1");
    });
  });
});
