import { describe, test, expect } from "bun:test";
import { success, fail, paginated } from "../response";
import type { ApiResponse, PaginatedData } from "../response";

describe("success()", () => {
  test("returns 200 with default message", async () => {
    const res = success();
    expect(res.status).toBe(200);

    const body: ApiResponse = await res.json();
    expect(body.code).toBe(0);
    expect(body.message).toBe("ok");
    expect(body.data).toBeUndefined();
  });

  test("includes data when provided", async () => {
    const res = success({ id: 1, name: "test" });
    const body: ApiResponse<{ id: number; name: string }> = await res.json();
    expect(body.data).toEqual({ id: 1, name: "test" });
  });

  test("uses custom message", async () => {
    const res = success(null, "created");
    const body: ApiResponse = await res.json();
    expect(body.message).toBe("created");
  });

  test("uses custom status code", () => {
    const res = success(null, "created", 201);
    expect(res.status).toBe(201);
  });

  test("sets JSON content-type", () => {
    const res = success();
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });
});

describe("fail()", () => {
  test("returns 400 with default code", async () => {
    const res = fail("bad request");
    expect(res.status).toBe(400);

    const body: ApiResponse = await res.json();
    expect(body.code).toBe(-1);
    expect(body.message).toBe("bad request");
  });

  test("uses custom error code", async () => {
    const res = fail("not found", 404);
    const body: ApiResponse = await res.json();
    expect(body.code).toBe(404);
  });

  test("uses custom status", () => {
    const res = fail("forbidden", 403, 403);
    expect(res.status).toBe(403);
  });

  test("does not include data field", async () => {
    const res = fail("error");
    const body: ApiResponse = await res.json();
    expect(body.data).toBeUndefined();
  });

  test("sets JSON content-type", () => {
    const res = fail("error");
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });
});

describe("paginated()", () => {
  test("returns paginated response", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const res = paginated(items, 10, 1, 5);
    expect(res.status).toBe(200);

    const body: ApiResponse<PaginatedData<{ id: number }>> = await res.json();
    expect(body.code).toBe(0);
    expect(body.message).toBe("ok");
    expect(body.data!.items).toEqual(items);
    expect(body.data!.total).toBe(10);
    expect(body.data!.page).toBe(1);
    expect(body.data!.pageSize).toBe(5);
    expect(body.data!.totalPages).toBe(2);
  });

  test("calculates totalPages correctly", async () => {
    const res = paginated([], 7, 1, 3);
    const body: ApiResponse<PaginatedData<unknown>> = await res.json();
    expect(body.data!.totalPages).toBe(3);
  });

  test("handles zero pageSize", async () => {
    const res = paginated([], 10, 1, 0);
    const body: ApiResponse<PaginatedData<unknown>> = await res.json();
    expect(body.data!.totalPages).toBe(0);
  });

  test("handles empty items", async () => {
    const res = paginated([], 0, 1, 10);
    const body: ApiResponse<PaginatedData<unknown>> = await res.json();
    expect(body.data!.items).toEqual([]);
    expect(body.data!.total).toBe(0);
    expect(body.data!.totalPages).toBe(0);
  });

  test("sets JSON content-type", () => {
    const res = paginated([], 0, 1, 10);
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });
});
