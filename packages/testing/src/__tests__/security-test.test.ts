import { describe, expect, test } from "bun:test";
import { createSecurityTestSuite } from "../security-test";

describe("createSecurityTestSuite", () => {
  const suite = createSecurityTestSuite();

  describe("xssPayloads", () => {
    test("returns non-empty array of strings", () => {
      const payloads = suite.xssPayloads();
      expect(payloads.length).toBeGreaterThan(0);
      for (const p of payloads) {
        expect(typeof p).toBe("string");
      }
    });

    test("includes common XSS vectors", () => {
      const payloads = suite.xssPayloads();
      const joined = payloads.join("\n");
      expect(joined).toContain("<script>");
      expect(joined).toContain("onerror");
      expect(joined).toContain("javascript:");
    });

    test("returns a copy (mutations don't affect source)", () => {
      const a = suite.xssPayloads();
      a.push("mutated");
      const b = suite.xssPayloads();
      expect(b).not.toContain("mutated");
    });
  });

  describe("sqlInjectionPayloads", () => {
    test("returns non-empty array", () => {
      const payloads = suite.sqlInjectionPayloads();
      expect(payloads.length).toBeGreaterThan(0);
    });

    test("includes common SQLi vectors", () => {
      const payloads = suite.sqlInjectionPayloads();
      const joined = payloads.join("\n");
      expect(joined).toContain("OR 1=1");
      expect(joined).toContain("UNION SELECT");
      expect(joined).toContain("DROP TABLE");
    });
  });

  describe("pathTraversalPayloads", () => {
    test("returns non-empty array", () => {
      const payloads = suite.pathTraversalPayloads();
      expect(payloads.length).toBeGreaterThan(0);
    });

    test("includes common path traversal vectors", () => {
      const payloads = suite.pathTraversalPayloads();
      const joined = payloads.join("\n");
      expect(joined).toContain("../");
      expect(joined).toContain("etc/passwd");
      expect(joined).toContain("%00");
    });
  });

  describe("csrfPayloads", () => {
    test("returns array of method/headers objects", () => {
      const payloads = suite.csrfPayloads();
      expect(payloads.length).toBeGreaterThan(0);
      for (const p of payloads) {
        expect(p).toHaveProperty("method");
        expect(p).toHaveProperty("headers");
      }
    });
  });

  describe("oversizedPayload", () => {
    test("returns string of exact size", () => {
      const payload = suite.oversizedPayload(1024);
      expect(payload.length).toBe(1024);
    });

    test("returns string of large size", () => {
      const payload = suite.oversizedPayload(1_000_000);
      expect(payload.length).toBe(1_000_000);
    });
  });

  describe("testEndpoint", () => {
    test("passes when all payloads return expected status", async () => {
      const mockClient = {
        fetch: async () => new Response("Bad Request", { status: 400 }),
      };

      const result = await suite.testEndpoint(
        mockClient,
        "http://localhost/test",
        { testXSS: true, testSQLi: false, testPathTraversal: false },
      );

      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    test("fails when payloads return unexpected status", async () => {
      const mockClient = {
        fetch: async () => new Response("OK", { status: 200 }),
      };

      const result = await suite.testEndpoint(
        mockClient,
        "http://localhost/test",
        { testXSS: true, testSQLi: false, testPathTraversal: false },
      );

      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    test("handles fetch errors gracefully", async () => {
      const mockClient = {
        fetch: async () => {
          throw new Error("Connection refused");
        },
      };

      const result = await suite.testEndpoint(
        mockClient,
        "http://localhost/test",
        { testXSS: true, testSQLi: false, testPathTraversal: false },
      );

      expect(result.passed).toBe(false);
      expect(result.failures[0]).toContain("Connection refused");
    });

    test("tests all categories when no options specified", async () => {
      let callCount = 0;
      const mockClient = {
        fetch: async () => {
          callCount++;
          return new Response("Rejected", { status: 400 });
        },
      };

      const result = await suite.testEndpoint(
        mockClient,
        "http://localhost/test",
      );

      expect(result.passed).toBe(true);
      // XSS (10) + SQLi (10) + Path Traversal (10)
      expect(callCount).toBe(30);
    });

    test("respects custom expectedStatus", async () => {
      const mockClient = {
        fetch: async () => new Response("OK", { status: 200 }),
      };

      const result = await suite.testEndpoint(
        mockClient,
        "http://localhost/test",
        {
          expectedStatus: [200],
          testXSS: true,
          testSQLi: false,
          testPathTraversal: false,
        },
      );

      expect(result.passed).toBe(true);
    });
  });
});
