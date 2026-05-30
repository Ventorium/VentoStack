/**
 * @ventostack/scheduler - 调度服务测试
 */

import { describe, expect, test } from "bun:test";
import { createSchedulerService } from "../services/scheduler";
import { createMockDatabase, createMockExecutor, createMockScheduler } from "./helpers";

function setup(
  handlers: Record<string, (params?: Record<string, unknown>) => Promise<void> | void> = {},
) {
  const mockExec = createMockExecutor();
  const { db } = createMockDatabase(mockExec);
  const scheduler = createMockScheduler();
  const schedulerService = createSchedulerService({ db, scheduler, handlers });
  return {
    schedulerService,
    executor: mockExec.executor,
    calls: mockExec.calls,
    results: mockExec.results,
    scheduler,
  };
}

describe("Scheduler Service", () => {
  describe("create", () => {
    test("创建任务返回 ID", async () => {
      const s = setup();
      const result = await s.schedulerService.create({
        name: "Test Job",
        handlerId: "test-handler",
        cron: "*/5 * * * *",
      });

      expect(result.id).toBeTruthy();
      const insertCall = s.calls.find((c) => c.text.includes("INSERT"));
      expect(insertCall).toBeTruthy();
    });

    test("创建带参数的任务", async () => {
      const s = setup();
      const result = await s.schedulerService.create({
        name: "Cleanup",
        handlerId: "cleanup",
        cron: "0 0 * * *",
        params: { olderThan: "7d" },
        description: "Daily cleanup",
      });

      expect(result.id).toBeTruthy();
    });
  });

  describe("update", () => {
    test("更新任务名称和 cron", async () => {
      const s = setup();
      await s.schedulerService.update("job-1", { name: "Updated Job", cron: "*/10 * * * *" });

      const updateCall = s.calls.find((c) => c.text.includes("UPDATE"));
      expect(updateCall).toBeTruthy();
    });

    test("空更新不执行 SQL", async () => {
      const s = setup();
      await s.schedulerService.update("job-1", {});
      const updateCall = s.calls.find((c) => c.text.includes("UPDATE"));
      expect(updateCall).toBeUndefined();
    });
  });

  describe("delete", () => {
    test("删除任务清理日志和任务记录", async () => {
      const s = setup();
      await s.schedulerService.delete("job-1");

      const deleteCalls = s.calls.filter((c) => c.text.includes("DELETE"));
      expect(deleteCalls.length).toBe(2); // logs + job
    });
  });

  describe("start / stop", () => {
    test("start 更新状态为 RUNNING 并注册调度", async () => {
      const handler = async () => {};
      const s = setup({ "test-handler": handler });

      // Mock getById
      s.results.set("SELECT", [
        {
          id: "job-1",
          name: "Test",
          handler_id: "test-handler",
          cron: "*/5 * * * *",
          params: null,
          status: 0,
          description: null,
          created_at: new Date("2024-01-01"),
          updated_at: new Date("2024-01-01"),
        },
      ]);

      await s.schedulerService.start("job-1");

      const updateCall = s.calls.find(
        (c) => c.text.includes("UPDATE") && c.text.includes("status"),
      );
      expect(updateCall).toBeTruthy();
      expect(s.scheduler.schedule).toHaveBeenCalled();
    });

    test("stop 更新状态为 PAUSED 并停止调度", async () => {
      const s = setup();
      await s.schedulerService.stop("job-1");

      const updateCall = s.calls.find(
        (c) => c.text.includes("UPDATE") && c.text.includes("status"),
      );
      expect(updateCall).toBeTruthy();
    });
  });

  describe("executeNow", () => {
    test("立即执行成功记录日志", async () => {
      const executed: string[] = [];
      const s = setup({
        "test-handler": async () => {
          executed.push("done");
        },
      });

      s.results.set("SELECT", [
        {
          id: "job-1",
          name: "Test",
          handler_id: "test-handler",
          cron: "*/5 * * * *",
          params: null,
          status: 1,
          description: null,
          created_at: new Date("2024-01-01"),
          updated_at: new Date("2024-01-01"),
        },
      ]);

      await s.schedulerService.executeNow("job-1");

      expect(executed).toEqual(["done"]);
      // Should have written RUNNING log then updated to SUCCESS
      const insertLog = s.calls.filter(
        (c) => c.text.includes("INSERT") && c.text.includes("job_log"),
      );
      expect(insertLog.length).toBeGreaterThanOrEqual(1);
    });

    test("执行失败抛异常并记录错误日志", async () => {
      const s = setup({
        "fail-handler": async () => {
          throw new Error("boom");
        },
      });

      s.results.set("SELECT", [
        {
          id: "job-1",
          name: "Test",
          handler_id: "fail-handler",
          cron: "*/5 * * * *",
          params: null,
          status: 1,
          description: null,
          created_at: new Date("2024-01-01"),
          updated_at: new Date("2024-01-01"),
        },
      ]);

      await expect(s.schedulerService.executeNow("job-1")).rejects.toThrow("boom");
    });

    test("不存在的任务抛异常", async () => {
      const s = setup();
      await expect(s.schedulerService.executeNow("nonexistent")).rejects.toThrow("任务不存在");
    });

    test("未注册的 handler 抛异常", async () => {
      const s = setup();

      s.results.set("SELECT", [
        {
          id: "job-1",
          name: "Test",
          handler_id: "unknown-handler",
          cron: "*/5 * * * *",
          params: null,
          status: 1,
          description: null,
          created_at: new Date("2024-01-01"),
          updated_at: new Date("2024-01-01"),
        },
      ]);

      await expect(s.schedulerService.executeNow("job-1")).rejects.toThrow("not registered");
    });
  });

  describe("list", () => {
    test("分页查询任务列表", async () => {
      const s = setup();
      s.results.set("COUNT", [{ total: 1 }]);
      s.results.set("SELECT", [
        {
          id: "j1",
          name: "Job 1",
          handler_id: "h1",
          cron: "*/5 * * * *",
          params: null,
          status: 1,
          description: null,
          created_at: new Date("2024-01-01"),
          updated_at: new Date("2024-01-01"),
        },
      ]);

      const result = await s.schedulerService.list({ page: 1, pageSize: 10 });
      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
    });
  });

  describe("listLogs", () => {
    test("按 jobId 筛选日志", async () => {
      const s = setup();
      s.results.set("COUNT", [{ total: 0 }]);

      await s.schedulerService.listLogs({ jobId: "job-1", page: 1, pageSize: 10 });
      const countCall = s.calls.find((c) => c.text.includes("COUNT") && c.text.includes("job_log"));
      expect(countCall?.params).toContain("job-1");
    });
  });
});
