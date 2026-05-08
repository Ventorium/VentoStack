/**
 * @ventostack/system - NoticeService 测试
 */

import { describe, expect, test } from "bun:test";
import { createNoticeService } from "../services/notice";
import { createMockExecutor, createMockDatabase } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel("sys_notice", "sys_notice", true);
  const noticeService = createNoticeService({ db });
  return { noticeService, executor: mockExec.executor, calls, results: mockExec.results };
}

describe("NoticeService", () => {
  test("create inserts notice with generated id", async () => {
    const s = setup();
    const result = await s.noticeService.create({ title: "系统公告", content: "测试内容", type: 1 });
    expect(result.id).toBeTruthy();
    expect(s.calls.some(c => c.text.includes("INSERT"))).toBe(true);
  });

  test("update executes UPDATE with changed fields", async () => {
    const s = setup();
    await s.noticeService.update("n1", { title: "新标题", status: 1 });
    expect(s.calls.some(c => c.text.includes("UPDATE"))).toBe(true);
  });

  test("update with no fields does nothing", async () => {
    const s = setup();
    await s.noticeService.update("n1", {});
    expect(s.calls.length).toBe(0);
  });

  test("delete performs soft delete", async () => {
    const s = setup();
    await s.noticeService.delete("n1");
    expect(s.calls.some(c => c.text.includes("deleted_at"))).toBe(true);
  });

  test("list returns paginated results", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 2 }]);
    s.results.set("SELECT", [
      { id: "n1", title: "公告1", content: "内容1", type: 1, status: 1, publisher_id: "u1", publish_at: "2025-01-01" },
      { id: "n2", title: "公告2", content: "内容2", type: 2, status: 0, publisher_id: null, publish_at: null },
    ]);
    const result = await s.noticeService.list({ page: 1, pageSize: 10 });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
  });

  test("list with empty result returns zero items", async () => {
    const s = setup();
    s.results.set("COUNT", [{ count: 0 }]);
    const result = await s.noticeService.list();
    expect(result.items.length).toBe(0);
    expect(result.total).toBe(0);
  });

  test("publish updates status to 1", async () => {
    const s = setup();
    await s.noticeService.publish("n1", "u1");
    expect(s.calls.some(c => c.text.includes("status") && c.text.includes("publisher_id"))).toBe(true);
  });

  test("revoke updates status to 2", async () => {
    const s = setup();
    await s.noticeService.revoke("n1");
    expect(s.calls.some(c => c.text.includes("status"))).toBe(true);
  });

  test("markRead inserts user-notice record", async () => {
    const s = setup();
    await s.noticeService.markRead("u1", "n1");
    expect(s.calls.some(c => c.text.includes("sys_user_notice"))).toBe(true);
  });

  test("getUnreadCount returns count", async () => {
    const s = setup();
    s.results.set("COUNT", [{ cnt: 5 }]);
    const count = await s.noticeService.getUnreadCount("u1");
    expect(count).toBe(5);
  });

  test("getUnreadCount returns 0 when no unread", async () => {
    const s = setup();
    const count = await s.noticeService.getUnreadCount("u1");
    expect(count).toBe(0);
  });
});
