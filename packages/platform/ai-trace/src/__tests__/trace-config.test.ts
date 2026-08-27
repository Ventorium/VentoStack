/**
 * @ventostack/ai-trace - 追踪开关配置服务测试
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createTraceConfigService, TRACE_CONFIG_KEY } from "../services/trace-config";
import { createMockDatabase, createMockExecutor } from "./helpers";

function setup() {
  const mockExec = createMockExecutor();
  const { db } = createMockDatabase(mockExec);
  const state = { value: null as string | null };
  const getValue = mock(async () => state.value);
  const refreshCache = mock(async () => {});
  const config = createTraceConfigService({
    db,
    configProvider: { getValue, refreshCache },
  });
  return { config, calls: mockExec.calls, results: mockExec.results, state, refreshCache };
}

describe("TraceConfigService", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  test("缺省（key 不存在）视为开启：默认可审计", async () => {
    expect(await s.config.isEnabled()).toBe(true);
  });

  test("'true' / 'false' 字符串解析", async () => {
    s.state.value = "true";
    expect(await s.config.isEnabled()).toBe(true);
    s.state.value = "false";
    expect(await s.config.isEnabled()).toBe(false);
  });

  test("setEnabled：UPDATE 命中已有 key 时不插入", async () => {
    s.results.set("RETURNING id", [{ id: 1 }]);

    await s.config.setEnabled(false);

    const update = s.calls.find((c) => c.text.includes("UPDATE sys_config"));
    expect(update).toBeDefined();
    expect(update!.params![0]).toBe("false");
    expect(update!.params![1]).toBe(TRACE_CONFIG_KEY);
    expect(s.calls.some((c) => c.text.includes("INSERT INTO sys_config"))).toBe(false);
    expect(s.refreshCache).toHaveBeenCalledWith(TRACE_CONFIG_KEY);
  });

  test("setEnabled：key 不存在时插入（ON CONFLICT 幂等）", async () => {
    await s.config.setEnabled(true);

    const insert = s.calls.find((c) => c.text.includes("INSERT INTO sys_config"));
    expect(insert).toBeDefined();
    expect(insert!.text).toContain("ON CONFLICT (key) DO UPDATE");
    expect(insert!.params![3]).toBe("true");
    expect(s.refreshCache).toHaveBeenCalledWith(TRACE_CONFIG_KEY);
  });
});
