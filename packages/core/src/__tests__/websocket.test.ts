import { describe, test, expect } from "bun:test";
import { createWebSocketRouter } from "../websocket";

describe("createWebSocketRouter", () => {
  test("registers ws route", () => {
    const router = createWebSocketRouter();
    router.ws("/chat", {
      message: () => {},
    });
    expect(router.routes()).toHaveLength(1);
    expect(router.routes()[0]!.path).toBe("/chat");
  });

  test("registers multiple ws routes", () => {
    const router = createWebSocketRouter();
    router.ws("/chat", { message: () => {} });
    router.ws("/notifications", { message: () => {} });
    expect(router.routes()).toHaveLength(2);
  });

  test("supports chaining", () => {
    const router = createWebSocketRouter();
    const result = router
      .ws("/a", { message: () => {} })
      .ws("/b", { message: () => {} });
    expect(result).toBe(router);
    expect(router.routes()).toHaveLength(2);
  });

  test("compile returns upgrade function", () => {
    const router = createWebSocketRouter();
    router.ws("/chat", {
      message: () => {},
    });
    const compiled = router.compile();
    expect(compiled.upgrade).toBeDefined();
    expect(compiled.handlers).toBeDefined();
    expect(compiled.routes).toHaveLength(1);
  });

  test("compile upgrade matches path", () => {
    const router = createWebSocketRouter();
    const messages: string[] = [];
    router.ws("/chat", {
      message: (_ws, msg) => {
        messages.push(String(msg));
      },
    });
    const compiled = router.compile();

    // Mock server
    let upgraded = false;
    let upgradeData: unknown;
    const mockServer = {
      upgrade(req: Request, opts?: { data?: unknown }) {
        upgraded = true;
        upgradeData = opts?.data;
        return true;
      },
    };

    const req = new Request("http://localhost/chat");
    const result = compiled.upgrade(req, mockServer);
    expect(result).toBe(true);
    expect(upgraded).toBe(true);
    expect((upgradeData as Record<string, unknown>).__wsPath).toBe("/chat");
  });

  test("compile upgrade rejects unknown path", () => {
    const router = createWebSocketRouter();
    router.ws("/chat", { message: () => {} });
    const compiled = router.compile();

    const mockServer = {
      upgrade() {
        return false;
      },
    };

    const req = new Request("http://localhost/unknown");
    const result = compiled.upgrade(req, mockServer);
    expect(result).toBe(false);
  });

  test("wildcard route matches", () => {
    const router = createWebSocketRouter();
    router.ws("/ws/*", { message: () => {} });
    const compiled = router.compile();

    let upgraded = false;
    const mockServer = {
      upgrade() {
        upgraded = true;
        return true;
      },
    };

    const req = new Request("http://localhost/ws/chat/room1");
    compiled.upgrade(req, mockServer);
    expect(upgraded).toBe(true);
  });

  test("compile handlers dispatch to correct route", () => {
    const router = createWebSocketRouter();
    const openCalled: string[] = [];

    router.ws("/chat", {
      open: () => openCalled.push("chat"),
      message: () => {},
    });

    const compiled = router.compile();
    const mockWS = {
      data: { __wsPath: "/chat" },
      send: () => {},
      close: () => {},
      readyState: 1,
    };

    compiled.handlers.open(mockWS as any);
    expect(openCalled).toEqual(["chat"]);
  });

  test("route with data factory", () => {
    const router = createWebSocketRouter();
    router.ws("/chat", {
      message: () => {},
      data: (req) => ({ userId: "123" }),
    });
    const compiled = router.compile();

    let upgradeData: unknown;
    const mockServer = {
      upgrade(_req: Request, opts?: { data?: unknown }) {
        upgradeData = opts?.data;
        return true;
      },
    };

    const req = new Request("http://localhost/chat");
    compiled.upgrade(req, mockServer);
    expect((upgradeData as Record<string, unknown>).userId).toBe("123");
  });
});
