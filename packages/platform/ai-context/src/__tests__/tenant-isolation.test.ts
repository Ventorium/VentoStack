import { describe, expect, test } from "bun:test";
import { createContextQueries } from "../services/context-queries";
import { createContextStore } from "../services/context-store";
import { createMockDatabase, createMockExecutor } from "./helpers";

describe("租户隔离 fail-closed", () => {
  describe("查询服务", () => {
    test("tenantId 缺失时拒绝查询，不退化为跨租户列表", () => {
      const { db } = createMockDatabase(createMockExecutor());
      const queries = createContextQueries(db);
      expect(() => queries.listSessions({ tenantId: "", page: 1, pageSize: 10 })).toThrow(/tenantId/);
    });

    test("tenantId 为空字符串时拒绝概览", () => {
      const { db } = createMockDatabase(createMockExecutor());
      const queries = createContextQueries(db);
      expect(() => queries.getOverview("   ", 7)).toThrow(/tenantId/);
    });

    test("tenantId 缺失时拒绝详情", () => {
      const { db } = createMockDatabase(createMockExecutor());
      const queries = createContextQueries(db);
      expect(() => queries.getDetail("", "s1")).toThrow(/tenantId/);
    });

    test("会话查询必须携带 tenant_id 过滤", async () => {
      const mockExec = createMockExecutor();
      const { calls } = mockExec;
      const { db } = createMockDatabase(mockExec);
      const queries = createContextQueries(db);

      await queries.getSession("tenant-a", "s1");

      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.text).toContain("tenant_id");
        expect(call.params).toContain("tenant-a");
      }
    });

    test("会话列表查询必须携带 tenant_id 过滤", async () => {
      const mockExec = createMockExecutor();
      const { calls } = mockExec;
      const { db } = createMockDatabase(mockExec);
      const queries = createContextQueries(db);

      await queries.listSessions({ tenantId: "tenant-a", page: 1, pageSize: 10 });

      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.text).toContain("tenant_id");
        expect(call.params).toContain("tenant-a");
      }
    });
  });

  describe("存储服务", () => {
    test("upsertSession 缺少 tenantId 时抛错", async () => {
      const { db } = createMockDatabase(createMockExecutor());
      const store = createContextStore({ db });
      await expect(store.upsertSession({ tenantId: "", sessionId: "s1" })).rejects.toThrow(/tenantId/);
    });

    test("applyOps 缺少 tenantId 时抛错", async () => {
      const { db } = createMockDatabase(createMockExecutor());
      const store = createContextStore({ db });
      await expect(store.applyOps("", "s1", [])).rejects.toThrow(/tenantId/);
    });

    test("upsertSession 写入携带 tenant_id 且用 (tenant, session) 幂等", async () => {
      const mockExec = createMockExecutor();
      const { calls } = mockExec;
      const { db } = createMockDatabase(mockExec);
      const store = createContextStore({ db });

      await store.upsertSession({ tenantId: "tenant-a", sessionId: "s1" });

      expect(calls).toHaveLength(1);
      expect(calls[0]!.text).toContain("tenant_id");
      expect(calls[0]!.text).toContain("ON CONFLICT (tenant_id, session_id)");
      expect(calls[0]!.params).toContain("tenant-a");
    });

    test("closeSession 按 tenant + session 限定", async () => {
      const mockExec = createMockExecutor();
      const { calls } = mockExec;
      const { db } = createMockDatabase(mockExec);
      const store = createContextStore({ db });

      await store.closeSession("tenant-a", "s1", "success");

      expect(calls[0]!.text).toContain("tenant_id = $2");
      expect(calls[0]!.text).toContain("session_id = $3");
      expect(calls[0]!.params).toContain("tenant-a");
    });

    test("closeSession 累加 run 耗时，非法值按 0 处理", async () => {
      const mockExec = createMockExecutor();
      const { calls } = mockExec;
      const { db } = createMockDatabase(mockExec);
      const store = createContextStore({ db });

      await store.closeSession("tenant-a", "s1", "success", 1234.6);
      expect(calls[0]!.text).toContain("duration_ms = COALESCE(duration_ms, 0) + $4");
      expect(calls[0]!.params).toEqual(["success", "tenant-a", "s1", 1235]);

      await store.closeSession("tenant-a", "s1", "success", Number.NaN);
      expect(calls[1]!.params).toEqual(["success", "tenant-a", "s1", 0]);

      await store.closeSession("tenant-a", "s1", "success", -10);
      expect(calls[2]!.params).toEqual(["success", "tenant-a", "s1", 0]);
    });

    test("currentSeq 缺少 tenantId 时抛错", async () => {
      const { db } = createMockDatabase(createMockExecutor());
      const store = createContextStore({ db });
      await expect(store.currentSeq("", "s1")).rejects.toThrow(/tenantId/);
    });

    test("currentSeq 查询四张表的 MAX(seq) 且携带 tenant + session 过滤", async () => {
      const mockExec = createMockExecutor();
      const { calls } = mockExec;
      const { db } = createMockDatabase(mockExec);
      const store = createContextStore({ db });

      await store.currentSeq("tenant-a", "s1");

      expect(calls).toHaveLength(1);
      const sql = calls[0]!.text;
      for (const table of ["ai_context_node", "ai_context_request", "ai_context_event", "ai_context_file_op"]) {
        expect(sql).toContain(table);
      }
      expect(sql).toContain("GREATEST");
      expect(calls[0]!.params).toEqual(["tenant-a", "s1"]);
    });

    test("currentSeq 对空结果返回 0（新会话无历史）", async () => {
      // mock 对未注册的 SQL 返回 []，模拟四张表都无记录
      const { db } = createMockDatabase(createMockExecutor());
      const store = createContextStore({ db });
      expect(await store.currentSeq("tenant-a", "s1")).toBe(0);
    });
  });
});