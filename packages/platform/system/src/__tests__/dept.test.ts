/**
 * @ventostack/system - DeptService 测试
 */

import { describe, expect, test } from "bun:test";
import { createDeptService } from "../services/dept";
import { createMockDatabase, createMockExecutor } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_dept", "sys_dept", true);
  registerModel("sys_role_dept", "sys_role_dept", false);
  const deptService = createDeptService({ db });
  return { deptService, executor: mockExec.executor, calls, results: mockExec.results };
}

describe("DeptService", () => {
  test("create inserts department with generated id", async () => {
    const s = setup();
    const result = await s.deptService.create({ name: "技术部", sort: 1 });
    expect(result.id).toBeTruthy();
    expect(s.calls.some((c) => c.text.includes("INSERT"))).toBe(true);
  });

  test("create with all optional fields", async () => {
    const s = setup();
    // 负责人用户存在且启用
    s.results.set("SELECT status FROM sys_user", [{ status: 1 }]);
    const result = await s.deptService.create({
      parentId: "d1",
      name: "前端组",
      sort: 2,
      leaderUserId: "u1",
      phone: "13800138000",
      email: "li@example.com",
    });
    expect(result.id).toBeTruthy();
  });

  test("create with invalid leader user throws", async () => {
    const s = setup();
    s.results.set("SELECT status FROM sys_user", []);
    await expect(
      s.deptService.create({ name: "技术部", leaderUserId: "ghost" }),
    ).rejects.toThrow("负责人用户不存在或已停用");
  });

  test("update executes UPDATE with changed fields", async () => {
    const s = setup();
    await s.deptService.update("d1", { name: "新名称", sort: 3, status: 1 });
    expect(s.calls.some((c) => c.text.includes("UPDATE"))).toBe(true);
  });

  test("update clears leader with null without validation", async () => {
    const s = setup();
    await s.deptService.update("d1", { leaderUserId: null });
    const updateCall = s.calls.find((c) => c.text.includes("UPDATE"));
    expect(updateCall).toBeTruthy();
    expect(JSON.stringify(updateCall)).toContain("leader_user_id");
  });

  test("update with no fields does nothing", async () => {
    const s = setup();
    await s.deptService.update("d1", {});
    expect(s.calls.length).toBe(0);
  });

  test("delete performs soft delete", async () => {
    const s = setup();
    await s.deptService.delete("d1");
    expect(s.calls.some((c) => c.text.includes("deleted_at"))).toBe(true);
  });

  test("getTree builds hierarchical structure and resolves leader names", async () => {
    const s = setup();
    // 注意：mock 按插入顺序做 includes 匹配，用表名区分两类查询，避免 "" 匹配所有 SQL
    s.results.set("sys_dept", [
      {
        id: "d1",
        parent_id: null,
        name: "总公司",
        sort: 1,
        leader_user_id: "u0",
        phone: "",
        email: "",
        status: 1,
      },
      {
        id: "d2",
        parent_id: "d1",
        name: "技术部",
        sort: 1,
        leader_user_id: "u1",
        phone: "",
        email: "",
        status: 1,
      },
      {
        id: "d3",
        parent_id: "d1",
        name: "市场部",
        sort: 2,
        leader_user_id: "u2",
        phone: "",
        email: "",
        status: 1,
      },
      {
        id: "d4",
        parent_id: "d2",
        name: "前端组",
        sort: 1,
        leader_user_id: null,
        phone: "",
        email: "",
        status: 1,
      },
    ]);
    // 批量解析负责人昵称的 raw 查询结果
    s.results.set("SELECT id, nickname, username FROM sys_user", [
      { id: "u0", nickname: "CEO", username: "ceo" },
      { id: "u1", nickname: "张三", username: "zhangsan" },
      { id: "u2", nickname: "李四", username: "lisi" },
    ]);
    const tree = await s.deptService.getTree();
    expect(tree.length).toBe(1);
    expect(tree[0]!.name).toBe("总公司");
    expect(tree[0]!.leaderUserId).toBe("u0");
    expect(tree[0]!.leaderName).toBe("CEO");
    expect(tree[0]!.children.length).toBe(2);
    expect(tree[0]!.children[0]!.name).toBe("技术部");
    expect(tree[0]!.children[0]!.leaderName).toBe("张三");
    expect(tree[0]!.children[0]!.children[0]!.name).toBe("前端组");
    expect(tree[0]!.children[0]!.children[0]!.leaderName).toBe("");
  });

  test("getTree with empty data returns empty array", async () => {
    const s = setup();
    const tree = await s.deptService.getTree();
    expect(tree).toEqual([]);
  });

  test("getTree handles orphaned nodes as roots", async () => {
    const s = setup();
    s.results.set("sys_dept", [
      {
        id: "d1",
        parent_id: null,
        name: "根部门",
        sort: 1,
        leader_user_id: null,
        phone: "",
        email: "",
        status: 1,
      },
      {
        id: "d2",
        parent_id: "nonexistent",
        name: "孤儿部门",
        sort: 1,
        leader_user_id: null,
        phone: "",
        email: "",
        status: 1,
      },
    ]);
    const tree = await s.deptService.getTree();
    expect(tree.length).toBe(2);
  });
});
