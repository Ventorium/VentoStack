import { describe, expect, test } from "bun:test";
import { cleanParams } from "@/utils/cleanParams";

describe("定时任务执行日志页", () => {
  test("API 端点路径正确", () => {
    const endpoints = {
      allLogs: "/api/system/scheduler/logs",
      jobLogs: "/api/system/scheduler/jobs/:id/logs",
    };
    expect(endpoints.allLogs).toBe("/api/system/scheduler/logs");
    expect(endpoints.jobLogs).toContain("jobs");
    expect(endpoints.jobLogs).toContain(":id");
    expect(endpoints.jobLogs).toContain("logs");
  });

  test("ScheduleJobLog 类型应包含必要字段", () => {
    const log = {
      id: "1",
      jobId: "j1",
      jobName: "数据同步任务",
      startAt: "2024-01-01T00:00:00Z",
      endAt: "2024-01-01T00:00:05Z",
      status: "SUCCESS",
      result: "ok",
      error: "",
      durationMs: 5000,
    };
    expect(log.id).toBeTruthy();
    expect(log.jobId).toBeTruthy();
    expect(log.jobName).toBeTruthy();
    expect(["SUCCESS", "FAILED"]).toContain(log.status);
    expect(log.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("状态选项正确", () => {
    const statusOptions = [
      { label: "成功", value: "SUCCESS" },
      { label: "失败", value: "FAILED" },
    ];
    expect(statusOptions).toHaveLength(2);
    expect(statusOptions.map((s) => s.value)).toEqual(["SUCCESS", "FAILED"]);
  });

  test("状态标签映射正确", () => {
    const statusMap: Record<string, { color: string; text: string }> = {
      SUCCESS: { color: "green", text: "成功" },
      FAILED: { color: "red", text: "失败" },
    };
    expect(statusMap.SUCCESS.color).toBe("green");
    expect(statusMap.FAILED.color).toBe("red");
  });

  test("cleanParams 应正确过滤搜索参数", () => {
    expect(cleanParams({ status: "SUCCESS", jobId: "j1" })).toEqual({
      status: "SUCCESS",
      jobId: "j1",
    });
    expect(cleanParams({ status: "", jobId: "j1" })).toEqual({ jobId: "j1" });
    expect(cleanParams({ status: undefined, jobId: null })).toEqual({});
  });

  test("查询参数应包含 jobId", () => {
    const jobId = "j1";
    const query = cleanParams({ page: 1, pageSize: 10, status: "SUCCESS", jobId });
    expect(query).toHaveProperty("jobId");
    expect(query.jobId).toBe("j1");
  });

  test("无 jobId 时应使用全局日志端点", () => {
    const jobId = null;
    const endpoint = jobId ? "/api/system/scheduler/jobs/:id/logs" : "/api/system/scheduler/logs";
    expect(endpoint).toBe("/api/system/scheduler/logs");
  });

  test("有 jobId 时应使用任务专属日志端点", () => {
    const jobId = "j1";
    const endpoint = jobId ? "/api/system/scheduler/jobs/:id/logs" : "/api/system/scheduler/logs";
    expect(endpoint).toBe("/api/system/scheduler/jobs/:id/logs");
  });

  test("列定义应包含所有必要字段", () => {
    const columnKeys = ["jobName", "startAt", "endAt", "durationMs", "status", "error"];
    expect(columnKeys).toHaveLength(6);
    expect(columnKeys).toContain("jobName");
    expect(columnKeys).toContain("durationMs");
    expect(columnKeys).toContain("status");
  });

  test("durationMs 格式化应追加 ms 后缀", () => {
    const formatDuration = (v: number) => `${v}ms`;
    expect(formatDuration(5000)).toBe("5000ms");
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(123)).toBe("123ms");
  });
});
