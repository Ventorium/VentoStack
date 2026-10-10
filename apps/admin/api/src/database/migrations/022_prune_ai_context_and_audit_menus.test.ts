import { describe, expect, mock, test } from 'bun:test';
import {
  PRUNE_MENU_PATHS,
  PRUNE_MENU_PERMISSIONS,
  pruneAiContextAndAuditMenus,
} from './022_prune_ai_context_and_audit_menus';

/** 收集迁移实际下发的 SQL 与执行顺序 */
function recorder() {
  const calls: string[] = [];
  const executor = mock(async (sql: string) => {
    calls.push(sql);
    return [];
  });
  return { calls, executor };
}

describe('022_prune_ai_context_and_audit_menus', () => {
  test('删除审计日志 / 审批中心 / 上下文洞察的菜单与配置', async () => {
    const { calls, executor } = recorder();
    await pruneAiContextAndAuditMenus.up(executor);

    expect(calls.some((s) => s.includes('DELETE FROM sys_menu'))).toBe(true);
    expect(calls.some((s) => s.includes('DELETE FROM sys_config'))).toBe(true);
  });

  test('菜单删除覆盖权限与路径两种匹配，避免漏掉孤儿行', async () => {
    const { calls, executor } = recorder();
    await pruneAiContextAndAuditMenus.up(executor);

    for (const perm of PRUNE_MENU_PERMISSIONS) {
      expect(calls.some((s) => s.includes(perm))).toBe(true);
    }
    for (const path of PRUNE_MENU_PATHS) {
      expect(calls.some((s) => s.includes(path))).toBe(true);
    }
  });

  test('按 RESTRICT 约束，先删按钮行再删父级菜单', async () => {
    const { calls, executor } = recorder();
    await pruneAiContextAndAuditMenus.up(executor);

    const buttonIdx = calls.findIndex((s) => s.includes('DELETE FROM sys_menu') && s.includes('permission IN'));
    const menuIdx = calls.findIndex((s) => s.includes('DELETE FROM sys_menu') && s.includes('path IN'));

    expect(buttonIdx).toBeGreaterThanOrEqual(0);
    expect(menuIdx).toBeGreaterThanOrEqual(0);
    // sys_menu.parent_id 是 ON DELETE RESTRICT，顺序反了会直接报错
    expect(buttonIdx).toBeLessThan(menuIdx);
  });

  test('仅删除 ai_context_enabled 这一个配置键，不误伤其它 AI 配置', async () => {
    const { calls, executor } = recorder();
    await pruneAiContextAndAuditMenus.up(executor);

    const sql = calls.find((s) => s.includes('DELETE FROM sys_config'))!;
    expect(sql).toContain("key = 'ai_context_enabled'");
    expect(sql).not.toContain('ai_trace_enabled');
    expect(sql).not.toContain('ai_enabled');
  });

  test('down 不还原菜单，交由种子负责（避免与种子重复插入）', async () => {
    const { calls, executor } = recorder();
    await pruneAiContextAndAuditMenus.down(executor);

    expect(calls).toHaveLength(0);
  });
});
