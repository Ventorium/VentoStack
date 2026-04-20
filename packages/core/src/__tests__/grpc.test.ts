import { describe, test, expect } from "bun:test";
import { createGRPCServer, GRPCError, GRPCStatusCode } from "../grpc";

describe("createGRPCServer", () => {
  const testService = {
    name: "UserService",
    methods: {
      getUser: { requestType: "GetUserRequest", responseType: "User" },
      createUser: { requestType: "CreateUserRequest", responseType: "User" },
    },
  };

  test("addService registers service", () => {
    const server = createGRPCServer();
    server.addService(testService, {
      getUser: async (req) => ({ id: (req as { id: string }).id, name: "Test" }),
      createUser: async (req) => ({ ...(req as object), id: "new" }),
    });
    expect(server.getServices()).toHaveLength(1);
    expect(server.getServices()[0].name).toBe("UserService");
  });

  test("addService throws if handler missing", () => {
    const server = createGRPCServer();
    expect(() => server.addService(testService, {
      getUser: async () => ({}),
    })).toThrow("Missing handler for method: UserService/createUser");
  });

  test("call invokes handler and returns result", async () => {
    const server = createGRPCServer();
    server.addService(testService, {
      getUser: async (req) => ({ id: (req as { id: string }).id, name: "Alice" }),
      createUser: async () => ({}),
    });
    const result = await server.call("UserService", "getUser", { id: "123" });
    expect(result).toEqual({ id: "123", name: "Alice" });
  });

  test("call passes metadata to context", async () => {
    const server = createGRPCServer();
    let receivedAuth: string | undefined;
    server.addService(testService, {
      getUser: async (_req, ctx) => { receivedAuth = ctx.metadata.get("authorization"); return {}; },
      createUser: async () => ({}),
    });
    await server.call("UserService", "getUser", {}, { authorization: "Bearer token" });
    expect(receivedAuth).toBe("Bearer token");
  });

  test("call throws GRPCError for unknown service", async () => {
    const server = createGRPCServer();
    try {
      await server.call("Unknown", "method", {});
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(GRPCError);
      expect((err as GRPCError).code).toBe(GRPCStatusCode.NOT_FOUND);
    }
  });

  test("call throws GRPCError for unknown method", async () => {
    const server = createGRPCServer();
    server.addService(testService, {
      getUser: async () => ({}),
      createUser: async () => ({}),
    });
    try {
      await server.call("UserService", "deleteUser", {});
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(GRPCError);
      expect((err as GRPCError).code).toBe(GRPCStatusCode.UNIMPLEMENTED);
    }
  });
});
