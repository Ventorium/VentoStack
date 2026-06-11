/**
 * @ventostack/system - TagService 测试
 */

import { describe, expect, test } from "bun:test";
import { createTagService } from "../services/tag";
import { createMockDatabase, createMockExecutor } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_tag", "sys_tag", true);
  registerModel("sys_user_tag", "sys_user_tag", false);
  const tagService = createTagService({ db });
  return { tagService, executor: mockExec.executor, calls, results: mockExec.results };
}

describe("TagService", () => {
  test("create inserts tag with generated id", async () => {
    const s = setup();
    const result = await s.tagService.create({
      name: "CEO",
      code: "ceo",
      sort: 100,
      remark: "首席执行官",
    });
    expect(result.id).toBeTruthy();
    expect(s.calls.some((c) => c.text.includes("INSERT"))).toBe(true);
  });

  test("update executes UPDATE with changed fields", async () => {
    const s = setup();
    await s.tagService.update("t1", { name: "总经理", sort: 2 });
    expect(s.calls.some((c) => c.text.includes("UPDATE"))).toBe(true);
  });

  test("update with no fields does nothing", async () => {
    const s = setup();
    await s.tagService.update("t1", {});
    expect(s.calls.length).toBe(0);
  });

  test("delete performs soft delete and cleans user_tag", async () => {
    const s = setup();
    await s.tagService.delete("t1");
    // Both calls use mock delete() which does soft delete (UPDATE ... SET deleted_at)
    const deleteCalls = s.calls.filter((c) => c.text.includes("deleted_at") || c.text.includes("DELETE"));
    expect(deleteCalls.length).toBe(2);
  });

  test("list returns paginated results", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 3 }]);
    s.results.set("SELECT", [
      { id: "t1", name: "CEO", code: "ceo", sort: 100, status: 1, remark: "" },
      { id: "t2", name: "总经理", code: "gm", sort: 90, status: 1, remark: "" },
    ]);
    const result = await s.tagService.list({ page: 1, pageSize: 10 });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
  });

  test("list with empty result returns zero items", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 0 }]);
    const result = await s.tagService.list();
    expect(result.items.length).toBe(0);
    expect(result.total).toBe(0);
  });

  test("listAll returns all active tags", async () => {
    const s = setup();
    s.results.set("SELECT", [
      { id: "t1", name: "CEO", code: "ceo", sort: 100, status: 1, remark: "" },
      { id: "t2", name: "领导", code: "leader", sort: 80, status: 1, remark: "" },
    ]);
    const result = await s.tagService.listAll();
    expect(result.length).toBe(2);
    expect(result[0].name).toBe("CEO");
  });

  test("assignUserTags clears old and inserts new relations", async () => {
    const s = setup();
    await s.tagService.assignUserTags("u1", ["t1", "t2", "t3"]);
    // Should have a delete (soft-delete via mock) + 3 INSERTs
    const clearCalls = s.calls.filter((c) => c.text.includes("deleted_at") || c.text.includes("DELETE"));
    const insertCalls = s.calls.filter((c) => c.text.includes("INSERT"));
    expect(clearCalls.length).toBe(1);
    expect(insertCalls.length).toBe(3);
  });

  test("assignUserTags with empty array only clears", async () => {
    const s = setup();
    await s.tagService.assignUserTags("u1", []);
    const clearCalls = s.calls.filter((c) => c.text.includes("deleted_at") || c.text.includes("DELETE"));
    const insertCalls = s.calls.filter((c) => c.text.includes("INSERT"));
    expect(clearCalls.length).toBe(1);
    expect(insertCalls.length).toBe(0);
  });

  test("getUserTagIds returns tag ids for user", async () => {
    const s = setup();
    s.results.set("SELECT", [{ tag_id: "t1" }, { tag_id: "t2" }]);
    const result = await s.tagService.getUserTagIds("u1");
    expect(result).toEqual(["t1", "t2"]);
  });

  test("getUserTags returns tag details for user", async () => {
    const s = setup();
    s.results.set("sys_tag", [
      { id: "t1", name: "CEO", code: "ceo", sort: 100, status: 1, remark: "", created_at: new Date() },
    ]);
    const result = await s.tagService.getUserTags("u1");
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("CEO");
  });

  test("getUserIdsByTag returns user ids for a tag", async () => {
    const s = setup();
    s.results.set("SELECT", [{ user_id: "u1" }, { user_id: "u2" }]);
    const result = await s.tagService.getUserIdsByTag("t1");
    expect(result).toEqual(["u1", "u2"]);
  });

  test("getUserIdsByTagCode returns user ids by tag code", async () => {
    const s = setup();
    s.results.set("sys_user_tag", [{ user_id: "u1" }]);
    const result = await s.tagService.getUserIdsByTagCode("ceo");
    expect(result).toEqual(["u1"]);
  });
});
