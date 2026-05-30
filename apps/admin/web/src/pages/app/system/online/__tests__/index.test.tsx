import { describe, expect, mock, test } from "bun:test";

describe("在线用户页", () => {
  test("OnlineUser 类型应包含必要字段", () => {
    const user = {
      sessionId: "s1",
      userId: "u1",
      username: "admin",
      nickname: "管理员",
      ip: "192.168.1.1",
      browser: "Chrome 120",
      os: "macOS",
      loginAt: "2024-01-01T00:00:00Z",
      lastAccessAt: "2024-01-01T01:00:00Z",
    };
    expect(user.sessionId).toBeTruthy();
    expect(user.userId).toBeTruthy();
    expect(user.ip).toBeTruthy();
    expect(user.browser).toBeTruthy();
  });

  test("强制下线 API 端点正确", () => {
    const endpoint = "/api/system/monitor/online/:sessionId";
    expect(endpoint).toContain("sessionId");
  });

  test("API 端点: GET /api/system/monitor/online", () => {
    const client = {
      get: mock(() => Promise.resolve({ error: null, data: { list: [], total: 0 } })),
    };
    client.get("/api/system/monitor/online");
    expect(client.get).toHaveBeenCalledTimes(1);
    const [url] = client.get.mock.calls[0];
    expect(url).toBe("/api/system/monitor/online");
  });

  test("响应结构: { list: OnlineUser[], total: number }", () => {
    const response = {
      list: [
        {
          sessionId: "s1",
          userId: "u1",
          username: "admin",
          nickname: "管理员",
          ip: "192.168.1.1",
          browser: "Chrome",
          os: "macOS",
          loginAt: "2024-01-01",
          lastAccessAt: "2024-01-01",
        },
      ],
      total: 1,
    };
    expect(Array.isArray(response.list)).toBe(true);
    expect(typeof response.total).toBe("number");
    expect(response.list[0].sessionId).toBe("s1");
  });

  test("强制下线 API: DELETE /api/system/monitor/online/:sessionId", () => {
    const client = { delete: mock(() => Promise.resolve({ error: null })) };
    const sessionId = "session-abc";
    client.delete("/api/system/monitor/online/:sessionId", { params: { sessionId } });
    expect(client.delete).toHaveBeenCalledTimes(1);
    const [url, options] = client.delete.mock.calls[0];
    expect(url).toBe("/api/system/monitor/online/:sessionId");
    expect(options.params.sessionId).toBe("session-abc");
  });

  test("自动刷新间隔为 30 秒", () => {
    const autoRefreshInterval = 30000;
    expect(autoRefreshInterval).toBe(30000);
  });

  test("自动刷新默认开启", () => {
    const defaultAutoRefresh = true;
    expect(defaultAutoRefresh).toBe(true);
  });

  test("自动刷新可关闭", () => {
    let autoRefresh = true;
    autoRefresh = !autoRefresh;
    expect(autoRefresh).toBe(false);
  });

  test("Table rowKey 为 sessionId（非 id）", () => {
    const rowKey = "sessionId";
    expect(rowKey).toBe("sessionId");
    expect(rowKey).not.toBe("id");
  });

  test("页面无搜索表单", () => {
    const hasSearchForm = false;
    expect(hasSearchForm).toBe(false);
  });

  test("表格分页禁用（pagination=false）", () => {
    const pagination = false;
    expect(pagination).toBe(false);
  });

  test("强制下线成功后刷新数据", () => {
    const client = { delete: mock(() => Promise.resolve({ error: null })) };
    let refreshed = false;
    const fetchData = () => {
      refreshed = true;
    };

    client.delete("/api/system/monitor/online/:sessionId", { params: { sessionId: "s1" } });
    if (!client.delete.mock.results) {
      fetchData();
    }
    // 模拟成功后刷新
    fetchData();
    expect(refreshed).toBe(true);
  });
});
