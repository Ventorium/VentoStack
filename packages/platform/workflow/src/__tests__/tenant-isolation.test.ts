/**
 * 安全回归测试 — 租户隔离 fail-closed
 *
 * 覆盖 CLAUDE.md §5.2 / §16 的硬约束：
 *   「任一路径无法解析或验证租户时必须 fail-closed」
 *
 * 历史缺陷：createWorkflowService 的 tenantId 缺省时，服务层 `if (tenantId)` 分支
 * 会跳过 tenant_id 过滤条件，退化为全表查询；路由层 getActor() 还会把缺失的
 * tenantId 静默兜底成 "default"。两条路径都可能导致跨租户数据可见。
 */

import { describe, expect, it } from "bun:test";
import { createWorkflowService } from "../services";
import { createMockDatabase, createMockExecutor } from "./helpers";

describe("租户隔离 fail-closed", () => {
  describe("createWorkflowService 工厂校验", () => {
    it("tenantId 缺失时构造失败，不得降级为全表查询", () => {
      const mockExec = createMockExecutor();
      const { db } = createMockDatabase(mockExec);
      // @ts-expect-error 故意省略必填的 tenantId
      expect(() => createWorkflowService({ db })).toThrow(/tenantId/);
    });

    it("tenantId 为空字符串时构造失败", () => {
      const mockExec = createMockExecutor();
      const { db } = createMockDatabase(mockExec);
      expect(() => createWorkflowService({ db, tenantId: "" })).toThrow(/tenantId/);
    });

    it("tenantId 仅含空白时构造失败", () => {
      const mockExec = createMockExecutor();
      const { db } = createMockDatabase(mockExec);
      expect(() => createWorkflowService({ db, tenantId: "   " })).toThrow(/tenantId/);
    });

    it("tenantId 合法时正常构造", () => {
      const mockExec = createMockExecutor();
      const { db } = createMockDatabase(mockExec);
      expect(() => createWorkflowService({ db, tenantId: "default" })).not.toThrow();
    });
  });

  describe("租户作用域随查询下发", () => {
    it("列表查询必须携带 tenant_id 过滤条件", async () => {
      const mockExec = createMockExecutor();
      const { calls } = mockExec;
      const { db } = createMockDatabase(mockExec);
      const service = createWorkflowService({ db, tenantId: "tenant-a" });

      await service.listDefinitions({ page: 1, pageSize: 10 });

      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.text).toContain("tenant_id");
        expect(call.params).toContain("tenant-a");
      }
    });

    it("详情查询必须按 tenant_id 约束，跨租户不可见", async () => {
      const mockExec = createMockExecutor();
      const { calls } = mockExec;
      const { db } = createMockDatabase(mockExec);
      const service = createWorkflowService({ db, tenantId: "tenant-a" });

      await service.getDefinition("some-id");

      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.text).toContain("tenant_id");
        expect(call.params).toContain("tenant-a");
      }
    });
  });
});