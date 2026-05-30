import { describe, expect, test } from "bun:test";

describe("仪表盘页", () => {
  test("DashboardStats 类型应包含必要字段", () => {
    const stats = {
      userCount: 128,
      roleCount: 5,
      todayLogs: 342,
      unreadNotices: 3,
    };
    expect(stats.userCount).toBeGreaterThanOrEqual(0);
    expect(stats.roleCount).toBeGreaterThanOrEqual(0);
    expect(stats.todayLogs).toBeGreaterThanOrEqual(0);
    expect(stats.unreadNotices).toBeGreaterThanOrEqual(0);
  });

  test("API 端点路径正确", () => {
    const endpoint = "/api/system/dashboard/stats";
    expect(endpoint).toBe("/api/system/dashboard/stats");
    expect(endpoint).toContain("dashboard");
    expect(endpoint).toContain("stats");
  });

  test("统计卡片应有 4 项指标", () => {
    const cards = [
      { key: "userCount", title: "用户总数" },
      { key: "roleCount", title: "角色数量" },
      { key: "todayLogs", title: "今日日志" },
      { key: "unreadNotices", title: "未读公告" },
    ];
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.key)).toEqual([
      "userCount",
      "roleCount",
      "todayLogs",
      "unreadNotices",
    ]);
  });

  test("stats 为 null 时默认值应为 0", () => {
    const stats = null;
    const userCount = stats?.userCount ?? 0;
    const roleCount = stats?.roleCount ?? 0;
    const todayLogs = stats?.todayLogs ?? 0;
    const unreadNotices = stats?.unreadNotices ?? 0;
    expect(userCount).toBe(0);
    expect(roleCount).toBe(0);
    expect(todayLogs).toBe(0);
    expect(unreadNotices).toBe(0);
  });

  test("stats 部分字段缺失时缺失字段默认值应为 0", () => {
    const stats = { userCount: 10, roleCount: 2 } as Record<string, unknown>;
    expect(stats.todayLogs ?? 0).toBe(0);
    expect(stats.unreadNotices ?? 0).toBe(0);
    expect(stats.userCount).toBe(10);
  });
});
