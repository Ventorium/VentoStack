import { describe, test, expect } from "bun:test";
import { createHealthCheck } from "../health";

describe("createHealthCheck", () => {
  describe("live", () => {
    test("always returns ok", () => {
      const hc = createHealthCheck();
      expect(hc.live()).toEqual({ status: "ok" });
    });
  });

  describe("ready", () => {
    test("returns ok with no checks", async () => {
      const hc = createHealthCheck();
      const result = await hc.ready();

      expect(result.status).toBe("ok");
      expect(result.checks).toEqual({});
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    test("returns ok when all checks pass", async () => {
      const hc = createHealthCheck();
      hc.addCheck("db", async () => true);
      hc.addCheck("redis", async () => true);

      const result = await hc.ready();

      expect(result.status).toBe("ok");
      expect(result.checks.db.status).toBe("ok");
      expect(result.checks.redis.status).toBe("ok");
    });

    test("returns degraded when some checks fail", async () => {
      const hc = createHealthCheck();
      hc.addCheck("db", async () => true);
      hc.addCheck("redis", async () => "Connection refused");

      const result = await hc.ready();

      expect(result.status).toBe("degraded");
      expect(result.checks.db.status).toBe("ok");
      expect(result.checks.redis.status).toBe("error");
      expect(result.checks.redis.message).toBe("Connection refused");
    });

    test("returns error when all checks fail", async () => {
      const hc = createHealthCheck();
      hc.addCheck("db", async () => "DB down");
      hc.addCheck("redis", async () => "Redis down");

      const result = await hc.ready();

      expect(result.status).toBe("error");
      expect(result.checks.db.status).toBe("error");
      expect(result.checks.redis.status).toBe("error");
    });

    test("catches thrown exceptions as error", async () => {
      const hc = createHealthCheck();
      hc.addCheck("crash", async () => {
        throw new Error("unexpected failure");
      });

      const result = await hc.ready();

      expect(result.status).toBe("error");
      expect(result.checks.crash.status).toBe("error");
      expect(result.checks.crash.message).toBe("unexpected failure");
    });

    test("catches non-Error thrown values", async () => {
      const hc = createHealthCheck();
      hc.addCheck("crash", async () => {
        throw "string error";
      });

      const result = await hc.ready();

      expect(result.checks.crash.status).toBe("error");
      expect(result.checks.crash.message).toBe("string error");
    });

    test("records duration for each check", async () => {
      const hc = createHealthCheck();
      hc.addCheck("fast", async () => true);
      hc.addCheck("slow", async () => {
        await new Promise((r) => setTimeout(r, 10));
        return true;
      });

      const result = await hc.ready();

      expect(result.checks.fast.duration).toBeDefined();
      expect(result.checks.fast.duration).toBeGreaterThanOrEqual(0);
      expect(result.checks.slow.duration).toBeDefined();
      expect(result.checks.slow.duration!).toBeGreaterThanOrEqual(5);
    });

    test("records duration for failed checks", async () => {
      const hc = createHealthCheck();
      hc.addCheck("fail", async () => "bad");

      const result = await hc.ready();

      expect(result.checks.fail.duration).toBeDefined();
      expect(result.checks.fail.duration).toBeGreaterThanOrEqual(0);
    });

    test("records duration for thrown checks", async () => {
      const hc = createHealthCheck();
      hc.addCheck("throw", async () => {
        throw new Error("boom");
      });

      const result = await hc.ready();

      expect(result.checks.throw.duration).toBeDefined();
    });
  });

  describe("uptime", () => {
    test("calculates uptime from custom start time", async () => {
      const startTime = Date.now() - 5000; // 5 seconds ago
      const hc = createHealthCheck({ startTime });

      const result = await hc.ready();

      expect(result.uptime).toBeGreaterThanOrEqual(4900);
      expect(result.uptime).toBeLessThan(6000);
    });

    test("calculates uptime from creation time", async () => {
      const hc = createHealthCheck();

      const result = await hc.ready();

      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.uptime).toBeLessThan(1000);
    });
  });

  describe("addCheck", () => {
    test("overwrites existing check with same name", async () => {
      const hc = createHealthCheck();
      hc.addCheck("db", async () => "fail");
      hc.addCheck("db", async () => true);

      const result = await hc.ready();

      expect(result.checks.db.status).toBe("ok");
    });
  });
});
