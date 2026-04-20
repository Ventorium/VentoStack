import { describe, test, expect } from "bun:test";
import { createSSRFGuard } from "../middlewares/ssrf";

describe("createSSRFGuard", () => {
  test("allows public URLs by default", () => {
    const guard = createSSRFGuard();
    const result = guard.validateURL("https://example.com/api");
    expect(result.safe).toBe(true);
  });

  test("blocks loopback addresses", () => {
    const guard = createSSRFGuard();
    const result = guard.validateURL("http://127.0.0.1/admin");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Blocked IP");
  });

  test("blocks private 10.x.x.x range", () => {
    const guard = createSSRFGuard();
    const result = guard.validateURL("http://10.0.0.1/internal");
    expect(result.safe).toBe(false);
  });

  test("blocks private 172.16.x.x range", () => {
    const guard = createSSRFGuard();
    const result = guard.validateURL("http://172.16.0.1/");
    expect(result.safe).toBe(false);
  });

  test("blocks private 192.168.x.x range", () => {
    const guard = createSSRFGuard();
    const result = guard.validateURL("http://192.168.1.1/");
    expect(result.safe).toBe(false);
  });

  test("blocks link-local 169.254.x.x (cloud metadata)", () => {
    const guard = createSSRFGuard();
    const result = guard.validateURL("http://169.254.169.254/latest/meta-data/");
    expect(result.safe).toBe(false);
  });

  test("blocks non-HTTP protocols", () => {
    const guard = createSSRFGuard();
    expect(guard.validateURL("file:///etc/passwd").safe).toBe(false);
    expect(guard.validateURL("data:text/html,<h1>hi</h1>").safe).toBe(false);
    expect(guard.validateURL("javascript:alert(1)").safe).toBe(false);
    expect(guard.validateURL("ftp://internal/file").safe).toBe(false);
  });

  test("allows whitelisted hosts even if they resolve to private IPs", () => {
    const guard = createSSRFGuard({ allowedHosts: ["internal.corp.com"] });
    const result = guard.validateURL("https://internal.corp.com/api");
    expect(result.safe).toBe(true);
  });

  test("allowPrivate=true permits private IPs", () => {
    const guard = createSSRFGuard({ allowPrivate: true });
    expect(guard.validateURL("http://192.168.1.1/").safe).toBe(true);
    expect(guard.validateURL("http://10.0.0.1/").safe).toBe(true);
    expect(guard.validateURL("http://127.0.0.1/").safe).toBe(true);
  });

  test("blocks IPv6 loopback", () => {
    const guard = createSSRFGuard();
    const result = guard.validateURL("http://[::1]/");
    expect(result.safe).toBe(false);
  });

  test("rejects invalid URLs", () => {
    const guard = createSSRFGuard();
    const result = guard.validateURL("not a url");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Invalid URL");
  });

  test("safeFetch throws on blocked URL", async () => {
    const guard = createSSRFGuard();
    expect(guard.safeFetch("http://127.0.0.1/admin")).rejects.toThrow(
      "SSRF blocked",
    );
  });

  test("custom blocked CIDRs", () => {
    const guard = createSSRFGuard({
      allowPrivate: true,
      blockedCIDRs: ["203.0.113.0/24"],
    });
    expect(guard.validateURL("http://203.0.113.5/").safe).toBe(false);
    expect(guard.validateURL("http://203.0.114.5/").safe).toBe(true);
  });

  test("blocks 0.0.0.0", () => {
    const guard = createSSRFGuard();
    expect(guard.validateURL("http://0.0.0.0/").safe).toBe(false);
  });
});
