import { describe, expect, test } from "bun:test";
import { createContextToggleService } from "../services/context-config";

/**
 * 采集开关改为按 Agent 判定（ai_agent.context_collection_enabled）。
 *
 * 关键性质：这是**采集**开关而非访问开关——漏采只是少一条调试数据，
 * 误采会把本不该落库的系统提示与消息写进库，所以读取失败一律按「不采集」处理。
 */
function withRows(rows: unknown, onSql?: (sql: string, params?: unknown[]) => void) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  return {
    calls,
    db: {
      raw: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        onSql?.(sql, params);
        return rows;
      },
    },
  };
}

describe("按 Agent 的采集开关", () => {
  test("开关为 true 时才采集", async () => {
    const on = createContextToggleService({ db: withRows([{ context_collection_enabled: true }]).db });
    const off = createContextToggleService({ db: withRows([{ context_collection_enabled: false }]).db });

    expect(await on.isEnabledForAgent("t1", "agent-a")).toBe(true);
    expect(await off.isEnabledForAgent("t1", "agent-a")).toBe(false);
  });

  test("缺省关闭：查不到行按不采集处理", async () => {
    const svc = createContextToggleService({ db: withRows([]).db });

    expect(await svc.isEnabledForAgent("t1", "agent-a")).toBe(false);
  });

  test("查询带租户与 agent 双条件（租户隔离）", async () => {
    const { db, calls } = withRows([{ context_collection_enabled: true }]);
    const svc = createContextToggleService({ db });

    await svc.isEnabledForAgent("t-a", "agent-x");

    expect(calls[0]?.sql).toContain("tenant_id = $1");
    expect(calls[0]?.sql).toContain("id = $2");
    expect(calls[0]?.params).toEqual(["t-a", "agent-x"]);
    expect(calls[0]?.sql).not.toContain("t-a");
  });

  test("租户或 agentId 缺失直接拒绝，不查库", async () => {
    const { db, calls } = withRows([{ context_collection_enabled: true }]);
    const svc = createContextToggleService({ db });

    expect(await svc.isEnabledForAgent("", "agent-a")).toBe(false);
    expect(await svc.isEnabledForAgent("   ", "agent-a")).toBe(false);
    expect(await svc.isEnabledForAgent("t1", "")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("读取抛错按不采集处理（fail-closed，不误采）", async () => {
    const svc = createContextToggleService({
      db: {
        raw: async () => {
          throw new Error("db down");
        },
      },
    });

    expect(await svc.isEnabledForAgent("t1", "agent-a")).toBe(false);
  });

  test("非布尔真值（如 1）不视为开启", async () => {
    const svc = createContextToggleService({ db: withRows([{ context_collection_enabled: 1 }]).db });

    expect(await svc.isEnabledForAgent("t1", "agent-a")).toBe(false);
  });
});
