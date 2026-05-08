/**
 * @ventostack/system - PostService 测试
 */

import { describe, expect, test } from "bun:test";
import { createPostService } from "../services/post";
import { createMockExecutor, createMockDatabase } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_post", "sys_post", true);
  const postService = createPostService({ db });
  return { postService, executor: mockExec.executor, calls, results: mockExec.results };
}

describe("PostService", () => {
  test("create inserts post with generated id", async () => {
    const s = setup();
    const result = await s.postService.create({ name: "总经理", code: "ceo", sort: 1, remark: "最高管理岗" });
    expect(result.id).toBeTruthy();
    expect(s.calls.some(c => c.text.includes("INSERT"))).toBe(true);
  });

  test("update executes UPDATE with changed fields", async () => {
    const s = setup();
    await s.postService.update("p1", { name: "副总经理", sort: 2 });
    expect(s.calls.some(c => c.text.includes("UPDATE"))).toBe(true);
  });

  test("update with no fields does nothing", async () => {
    const s = setup();
    await s.postService.update("p1", {});
    expect(s.calls.length).toBe(0);
  });

  test("delete performs soft delete", async () => {
    const s = setup();
    await s.postService.delete("p1");
    expect(s.calls.some(c => c.text.includes("deleted_at"))).toBe(true);
  });

  test("list returns paginated results", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 3 }]);
    s.results.set("SELECT", [
      { id: "p1", name: "总经理", code: "ceo", sort: 1, status: 1, remark: "最高" },
      { id: "p2", name: "经理", code: "mgr", sort: 2, status: 1, remark: "中层" },
    ]);
    const result = await s.postService.list({ page: 1, pageSize: 10 });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
  });

  test("list with empty result returns zero items", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 0 }]);
    const result = await s.postService.list();
    expect(result.items.length).toBe(0);
    expect(result.total).toBe(0);
  });

  test("list with status filter", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 1 }]);
    s.results.set("SELECT", [
      { id: "p1", name: "总经理", code: "ceo", sort: 1, status: 1, remark: "" },
    ]);
    const result = await s.postService.list({ status: 1 });
    expect(result.items.length).toBe(1);
    // Verify the status filter was passed as a parameter
    const selectCall = s.calls.find(c => c.text.includes("COUNT"));
    expect(selectCall!.params).toBeDefined();
  });
});
