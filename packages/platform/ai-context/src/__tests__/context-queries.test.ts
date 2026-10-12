/**
 * 上下文查询服务的详情装配测试
 *
 * 重点回归两类「接口 500 / 数字不自洽」问题：
 *  1. 详情装配里的字段初始化顺序（曾把用量派生写在 requests 映射之前，
 *     真实请求直接 ReferenceError 500，而 stub 掉 queries 的路由测试发现不了）
 *  2. 会话用量与请求行、请求步数与请求行数必须自洽（历史值来自「本 run 绝对值」，不可信）
 */
import { describe, expect, test } from "bun:test";
import { createContextQueries } from "../services/context-queries";
import { createMockDatabase, createMockExecutor } from "./helpers";

/** 会话行：bigint 以字符串、timestamp 以 Date 返回（Bun SQL 驱动的真实形态） */
const SESSION_ROW = {
  id: "036db456-ae9a-483e-a027-b46323e910ba",
  tenant_id: "tenant-a",
  session_id: "s1",
  run_count: 2,
  status: "success",
  usage_uncached: "8890",
  usage_output: "776",
  duration_ms: "35038",
  started_at: new Date("2026-10-11T16:14:02.696Z"),
  current_system: 160,
  current_user_msgs: 38,
  current_total: 198,
};

/** 请求行：两条有真实用量、一条提供方未上报 */
const REQUEST_ROWS = [
  {
    id: "r-1",
    session_id: "s1",
    seq: 3,
    turn_index: 1,
    act_uncached: "1200",
    act_output: "64",
    act_cache_read: "900",
    act_cache_write: "0",
    created_at: new Date("2026-10-11T16:14:02.696Z"),
  },
  {
    id: "r-2",
    session_id: "s1",
    seq: 5,
    turn_index: 2,
    act_uncached: "100",
    act_output: "20",
    act_cache_read: "0",
    act_cache_write: "0",
    created_at: new Date("2026-10-11T16:15:02.696Z"),
  },
  {
    id: "r-3",
    session_id: "s1",
    seq: 7,
    turn_index: 3,
    act_uncached: null,
    act_output: null,
    act_cache_read: null,
    act_cache_write: null,
    created_at: new Date("2026-10-11T16:16:02.696Z"),
  },
];

function queriesWith(rows: Record<string, unknown[]>) {
  const mockExec = createMockExecutor();
  for (const [pattern, result] of Object.entries(rows)) mockExec.results.set(pattern, result);
  const { db } = createMockDatabase(mockExec);
  return { queries: createContextQueries(db), calls: mockExec.calls };
}

describe("详情装配", () => {
  test("会话用量等于各请求真实用量之和（供方未上报的请求计 0）", async () => {
    const { queries } = queriesWith({
      "FROM ai_context_session": [SESSION_ROW],
      "FROM ai_context_request": REQUEST_ROWS,
    });

    const detail = await queries.getDetail("tenant-a", "s1");
    expect(detail).not.toBeNull();
    expect(detail!.session.usage).toEqual({
      uncached: 1300,
      cacheRead: 900,
      cacheWrite: 0,
      output: 84,
    });
  });

  test("请求步数按实际请求行数，不采信会话上的 step_count", async () => {
    const { queries } = queriesWith({
      "FROM ai_context_session": [{ ...SESSION_ROW, step_count: 1 }],
      "FROM ai_context_request": REQUEST_ROWS,
    });

    const detail = await queries.getDetail("tenant-a", "s1");
    expect(detail!.session.counts.steps).toBe(REQUEST_ROWS.length);
    expect(detail!.requests).toHaveLength(REQUEST_ROWS.length);
  });

  test("会话当前构成取 current_user_msgs（列名与前缀约定不同）", async () => {
    const { queries } = queriesWith({
      "FROM ai_context_session": [SESSION_ROW],
      "FROM ai_context_request": REQUEST_ROWS,
    });

    const detail = await queries.getDetail("tenant-a", "s1");
    expect(detail!.session.current.user).toBe(38);
    expect(detail!.session.startedAt).toBe("2026-10-11T16:14:02.696Z");
  });

  test("无会话记录时返回 null（由路由层转空详情）", async () => {
    const { queries } = queriesWith({ "FROM ai_context_session": [] });
    expect(await queries.getDetail("tenant-a", "s1")).toBeNull();
  });
});
