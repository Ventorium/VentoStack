/**
 * 行映射回归测试
 *
 * 来源 bug：Bun SQL 驱动把 int8(bigint) 解码为字符串、把 timestamp 解码为 Date，
 * 而映射层只认 number/string，导致 usage_*、duration_ms、started_at、created_at
 * 在接口响应里被静默读成 0 / ""（前端表现为「计费 tokens 0」「耗时 0ms」「开始时间 -」）。
 */
import { describe, expect, test } from "bun:test";
import {
  num,
  str,
  ts,
  toContextEvent,
  toContextSession,
  toRequestRecord,
  toSurfaceNode,
} from "../services/context-mappers";

describe("行映射：Bun SQL 驱动类型收敛", () => {
  test("num 接受 bigint 字符串，拒绝非数字", () => {
    expect(num({ a: "3160" }, "a")).toBe(3160);
    expect(num({ a: "0" }, "a")).toBe(0);
    expect(num({ a: 80 }, "a")).toBe(80);
    expect(num({ a: "abc" }, "a")).toBe(0);
    expect(num({ a: "" }, "a")).toBe(0);
    expect(num({ a: undefined }, "a")).toBe(0);
    // 布尔与对象不能被强转成数字
    expect(num({ a: true }, "a")).toBe(0);
    expect(num({ a: {} }, "a")).toBe(0);
  });

  test("str 只接受字符串，Date 不再被当成时间字符串", () => {
    expect(str({ a: "x" }, "a")).toBe("x");
    expect(str({ a: new Date() }, "a")).toBeNull();
    expect(str({ a: null }, "a")).toBeNull();
  });

  test("ts 把 Date 序列化为 ISO 字符串，空值归一为 null", () => {
    const d = new Date("2026-10-11T16:14:02.696Z");
    expect(ts({ a: d }, "a")).toBe("2026-10-11T16:14:02.696Z");
    expect(ts({ a: "2026-10-11T16:14:02.696Z" }, "a")).toBe("2026-10-11T16:14:02.696Z");
    expect(ts({ a: "" }, "a")).toBeNull();
    expect(ts({ a: null }, "a")).toBeNull();
    expect(ts({ a: new Date("invalid") }, "a")).toBeNull();
  });

  test("会话行：bigint usage / duration 与 Date 时间戳不再丢失", () => {
    const s = toContextSession({
      id: "s1",
      tenant_id: "default",
      session_id: "sess-1",
      run_count: 2,
      status: "success",
      usage_uncached: "3160",
      usage_cache_read: "0",
      usage_cache_write: "0",
      usage_output: "80",
      duration_ms: "612345",
      started_at: new Date("2026-10-11T16:14:02.696Z"),
      ended_at: new Date("2026-10-11T16:24:29.232Z"),
      current_system: 160,
      current_total: 203,
    });
    expect(s.usage).toEqual({ uncached: 3160, cacheRead: 0, cacheWrite: 0, output: 80 });
    expect(s.durationMs).toBe(612345);
    expect(s.startedAt).toBe("2026-10-11T16:14:02.696Z");
    expect(s.endedAt).toBe("2026-10-11T16:24:29.232Z");
    expect(s.runCount).toBe(2);
    expect(s.current.total).toBe(203);
  });

  test("会话行：current.user 取 current_user_msgs（列名与请求表不同，此前恒为 0）", () => {
    const s = toContextSession({
      id: "s1",
      session_id: "sess-1",
      // 真实列名是 current_user_msgs；若误读 current_user 则恒为 0，
      // 组成占比各分桶之和也会与 current_total 对不上
      current_system: 160,
      current_user_msgs: 38,
      current_assistant: 72,
      current_tool: 72,
      current_total: 342,
    });
    expect(s.current.user).toBe(38);
    expect(
      s.current.system + s.current.tools + s.current.user + s.current.inject +
        s.current.skill + s.current.assistant + s.current.tool,
    ).toBe(s.current.total);
  });

  test("会话行：无 started_at 时保持空串（空详情标记不被破坏）", () => {
    const s = toContextSession({ id: "", session_id: "", started_at: null, ended_at: null });
    expect(s.startedAt).toBe("");
    expect(s.endedAt).toBeNull();
  });

  test("请求行：act_* bigint 字符串映射为真实用量，时间戳映射为 ISO", () => {
    const r = toRequestRecord({
      id: "r1",
      session_id: "sess-1",
      seq: 10,
      turn_index: 1,
      message_count: 3,
      act_uncached: "1200",
      act_output: "64",
      act_cache_read: "900",
      act_cache_write: "0",
      duration_ms: "4321",
      created_at: new Date("2026-10-11T16:14:02.696Z"),
    });
    expect(r.actual).toEqual({
      uncachedInputTokens: 1200,
      outputTokens: 64,
      cacheReadTokens: 900,
      cacheWriteTokens: 0,
    });
    expect(r.durationMs).toBe(4321);
    expect(r.createdAt).toBe("2026-10-11T16:14:02.696Z");
  });

  test("请求行：无真实用量时 actual 为 null", () => {
    const r = toRequestRecord({ id: "r2", act_uncached: null, act_output: null });
    expect(r.actual).toBeNull();
  });

  test("节点行：created_at 由 Date 映射为 ISO", () => {
    const n = toSurfaceNode({
      id: "n-1",
      seq: 5,
      category: "system",
      tokens: 160,
      created_at: new Date("2026-10-11T16:14:02.696Z"),
    });
    expect(n.createdAt).toBe("2026-10-11T16:14:02.696Z");
  });

  test("事件行：created_at 由 Date 映射为 ISO", () => {
    const e = toContextEvent({
      id: "e1",
      seq: 3,
      kind: "compact",
      delta_tokens: -1200,
      created_at: new Date("2026-10-11T16:14:02.696Z"),
    });
    expect(e.deltaTokens).toBe(-1200);
    expect(e.createdAt).toBe("2026-10-11T16:14:02.696Z");
  });
});
