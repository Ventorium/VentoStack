import { describe, test, expect } from "bun:test";
import { ipFilter } from "../../middlewares/ip-filter";
import { createContext } from "../../context";

describe("ipFilter", () => {
  function makeReq(ip?: string): Request {
    const headers: Record<string, string> = {};
    if (ip) headers["x-forwarded-for"] = ip;
    return new Request("http://localhost/test", { headers });
  }

  test("allows request when no rules", async () => {
    const middleware = ipFilter();
    const ctx = createContext(makeReq("1.2.3.4"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(200);
  });

  test("blocks IP in denylist", async () => {
    const middleware = ipFilter({ denylist: ["1.2.3.4"] });
    const ctx = createContext(makeReq("1.2.3.4"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(403);
  });

  test("allows IP not in denylist", async () => {
    const middleware = ipFilter({ denylist: ["1.2.3.4"] });
    const ctx = createContext(makeReq("5.6.7.8"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(200);
  });

  test("allows IP in allowlist", async () => {
    const middleware = ipFilter({ allowlist: ["1.2.3.4"] });
    const ctx = createContext(makeReq("1.2.3.4"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(200);
  });

  test("blocks IP not in allowlist", async () => {
    const middleware = ipFilter({ allowlist: ["1.2.3.4"] });
    const ctx = createContext(makeReq("5.6.7.8"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(403);
  });

  test("CIDR matching", async () => {
    const middleware = ipFilter({ allowlist: ["10.0.0.0/8"] });
    const ctx1 = createContext(makeReq("10.1.2.3"));
    const r1 = await middleware(ctx1, async () => new Response("ok"));
    expect(r1.status).toBe(200);

    const ctx2 = createContext(makeReq("192.168.1.1"));
    const r2 = await middleware(ctx2, async () => new Response("ok"));
    expect(r2.status).toBe(403);
  });

  test("wildcard matching", async () => {
    const middleware = ipFilter({ denylist: ["192.168.1.*"] });
    const ctx = createContext(makeReq("192.168.1.100"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(403);
  });

  test("blocks when no IP in allowlist mode", async () => {
    const middleware = ipFilter({ allowlist: ["1.2.3.4"] });
    const ctx = createContext(makeReq()); // no IP header
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(403);
  });

  test("allows when no IP in no-rule mode", async () => {
    const middleware = ipFilter();
    const ctx = createContext(makeReq());
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(200);
  });

  test("custom getIP", async () => {
    const middleware = ipFilter({
      denylist: ["bad-ip"],
      getIP: (req) => req.headers.get("x-custom-ip"),
    });
    const ctx = createContext(
      new Request("http://localhost/test", { headers: { "x-custom-ip": "bad-ip" } }),
    );
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(403);
  });

  test("custom status code", async () => {
    const middleware = ipFilter({ denylist: ["1.2.3.4"], statusCode: 451 });
    const ctx = createContext(makeReq("1.2.3.4"));
    const response = await middleware(ctx, async () => new Response("ok"));
    expect(response.status).toBe(451);
  });
});
