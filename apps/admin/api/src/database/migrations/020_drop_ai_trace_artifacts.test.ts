import { describe, expect, mock, test } from 'bun:test';
import { dropAiTraceArtifacts } from './020_drop_ai_trace_artifacts';

/** 收集迁移实际下发的 SQL 与执行顺序 */
function recorder() {
  const calls: string[] = [];
  const executor = mock(async (sql: string) => {
    calls.push(sql);
    return [];
  });
  return { calls, executor };
}

describe('020_drop_ai_trace_artifacts', () => {
  test('删除 ai_trace 遗留对象', async () => {
    const { calls, executor } = recorder();
    await dropAiTraceArtifacts.up(executor);

    expect(calls.some((s) => s.includes('DELETE FROM sys_menu'))).toBe(true);
    expect(calls.some((s) => s.includes('DELETE FROM sys_config'))).toBe(true);
    expect(calls.some((s) => s.includes('DROP TABLE IF EXISTS ai_trace_span'))).toBe(true);
    expect(calls.some((s) => s.includes('DROP TABLE IF EXISTS ai_trace'))).toBe(true);
  });

  test('菜单删除覆盖权限与路径两种匹配，避免漏掉孤儿菜单行', async () => {
    const { calls, executor } = recorder();
    await dropAiTraceArtifacts.up(executor);

    const sql = calls.find((s) => s.includes('DELETE FROM sys_menu'))!;
    expect(sql).toContain("permission LIKE 'ai:trace:%'");
    expect(sql).toContain("path = '/app/ai/trace'");
  });

  test('仅删 ai_trace_enabled，不误伤其它 AI 配置键', async () => {
    const { calls, executor } = recorder();
    await dropAiTraceArtifacts.up(executor);

    const sql = calls.find((s) => s.includes('DELETE FROM sys_config'))!;
    expect(sql).toContain("key = 'ai_trace_enabled'");
    expect(sql).not.toContain('ai_context_enabled');
  });

  test('先删 span 再删 trace，保持父子删除顺序可预期', async () => {
    const { calls, executor } = recorder();
    await dropAiTraceArtifacts.up(executor);

    const spanIdx = calls.findIndex((s) => s.includes('DROP TABLE IF EXISTS ai_trace_span'));
    const traceIdx = calls.findIndex((s) => /DROP TABLE IF EXISTS ai_trace$/.test(s.trim()));
    expect(spanIdx).toBeGreaterThanOrEqual(0);
    expect(traceIdx).toBeGreaterThanOrEqual(0);
    expect(spanIdx).toBeLessThan(traceIdx);
  });

  test('down 重建两张空表结构', async () => {
    const { calls, executor } = recorder();
    await dropAiTraceArtifacts.down(executor);

    expect(calls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS ai_trace ('))).toBe(true);
    expect(calls.some((s) => s.includes('CREATE TABLE IF NOT EXISTS ai_trace_span ('))).toBe(true);
    // down 不得删除上下文洞察的新表
    expect(calls.some((s) => s.includes('ai_context'))).toBe(false);
  });
});
