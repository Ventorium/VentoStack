/**
 * @ventostack/system - ConfigService 测试
 */

import { describe, expect, test } from 'bun:test';
import {
  MASKED_CONFIG_VALUE,
  createConfigService,
  validatePresetConfigValue,
} from '../services/config';
import { createMockDatabase, createMockExecutor, createTestCache } from './helpers';

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel('sys_config', 'sys_config', true);
  const cache = createTestCache();
  const configService = createConfigService({ db, cache, tenantId: 'default' });
  return { configService, executor: mockExec.executor, calls, results: mockExec.results, cache };
}

describe('ConfigService', () => {
  test('validates preset config value domains', () => {
    expect(() => validatePresetConfigValue('sys_register_enabled', 'yes')).toThrow('true 或 false');
    expect(() => validatePresetConfigValue('ai_trace_enabled', '1')).toThrow('true 或 false');
    expect(() => validatePresetConfigValue('sys_login_max_attempts', '0')).toThrow('范围');
    expect(() => validatePresetConfigValue('sys_password_expire_days', '0')).toThrow('范围');
    expect(() => validatePresetConfigValue('sys_password_expire_days', '-1')).not.toThrow();
  });

  test('create inserts config', async () => {
    const s = setup();
    s.results.set('INSERT', [{ id: 'cfg1' }]);
    const result = await s.configService.create({
      name: '站点名称',
      key: 'site_name',
      value: 'VentoStack',
      type: 0,
    });
    expect(result.id).toBeTruthy();
  });

  test('getValue returns cached config value', async () => {
    const s = setup();
    s.results.set('SELECT', [{ value: 'VentoStack' }]);
    const value = await s.configService.getValue('site_name');
    expect(value).toBe('VentoStack');
  });

  test('getValue returns null for unknown key', async () => {
    const s = setup();
    const value = await s.configService.getValue('unknown_key');
    expect(value).toBeNull();
  });

  test('update changes config value', async () => {
    const s = setup();
    // update 现在先 SELECT key 再 UPDATE（与 delete 同模式）
    s.results.set('SELECT', [{ key: 'site_name' }]);
    await s.configService.update('cfg-123', { value: 'NewName' });
    expect(s.calls.some((c) => c.text.includes('SELECT'))).toBe(true);
    expect(s.calls.some((c) => c.text.includes('UPDATE'))).toBe(true);
  });

  test('delete removes config by id', async () => {
    const s = setup();
    // delete 现在先 SELECT key 再 DELETE，需要 mock SELECT 返回
    s.results.set('SELECT', [{ key: 'custom_key' }]);
    await s.configService.delete('cfg-123');
    // 第一次 call 是 SELECT（查 key），第二次是 soft delete (UPDATE SET deleted_at)
    expect(s.calls.some((c) => c.text.includes('SELECT'))).toBe(true);
    expect(s.calls.some((c) => c.text.includes('deleted_at'))).toBe(true);
  });

  test('delete rejects protected system config', async () => {
    const s = setup();
    // mock SELECT 返回受保护的 key
    s.results.set('SELECT', [{ key: 'sys_site_name' }]);
    expect(s.configService.delete('cfg-protected')).rejects.toThrow('不允许删除');
  });

  test.each(['sys_register_enabled', 'ai_trace_enabled'])(
    'delete rejects newly added preset config %s',
    async (key) => {
      const s = setup();
      s.results.set('SELECT', [{ key }]);
      expect(s.configService.delete('cfg-protected')).rejects.toThrow('不允许删除');
    },
  );

  test('update rejects when config not found', async () => {
    const s = setup();
    // mock SELECT 返回空
    s.results.set('SELECT', []);
    expect(s.configService.update('cfg-nonexistent', { value: 'x' })).rejects.toThrow(
      'Config not found',
    );
  });

  test('delete rejects when config not found', async () => {
    const s = setup();
    // mock SELECT 返回空
    s.results.set('SELECT', []);
    expect(s.configService.delete('cfg-nonexistent')).rejects.toThrow('Config not found');
  });

  test('refreshCache clears cached value', async () => {
    const s = setup();
    s.results.set('SELECT', [{ value: 'VentoStack' }]);
    await s.configService.getValue('site_name');
    await s.configService.refreshCache('site_name');
    // Next call should re-query
    await s.configService.getValue('site_name');
  });

  test('list masks sensitive configuration values', async () => {
    const s = setup();
    s.results.set('COUNT', [{ count: 1 }]);
    s.results.set('SELECT', [
      { id: 'cfg1', name: '初始密码', key: 'sys_user_init_password', value: 'DoNotLeak1!' },
    ]);
    const result = await s.configService.list();
    expect(result.items[0]?.value).toBe(MASKED_CONFIG_VALUE);
  });

  test('list classifies config sensitivity', async () => {
    const s = setup();
    s.results.set('COUNT', [{ count: 3 }]);
    s.results.set('SELECT', [
      { id: 'cfg1', name: '初始密码', key: 'sys_user_init_password', value: 'secret' },
      { id: 'cfg2', name: '站点名称', key: 'sys_site_name', value: 'VentoStack' },
      { id: 'cfg3', name: '业务参数', key: 'biz_page_size', value: '20' },
    ]);
    const result = await s.configService.list();
    expect(result.items.find((i) => i.key === 'sys_user_init_password')?.sensitivity).toBe(
      'security',
    );
    expect(result.items.find((i) => i.key === 'sys_site_name')?.sensitivity).toBe('public');
    expect(result.items.find((i) => i.key === 'sys_site_name')?.isSystem).toBe(true);
    expect(result.items.find((i) => i.key === 'biz_page_size')?.sensitivity).toBe('business');
    expect(result.items.find((i) => i.key === 'biz_page_size')?.isSystem).toBe(false);
  });

  test('masked sensitive value means keep the existing secret', async () => {
    const s = setup();
    s.results.set('SELECT', [{ key: 'sys_user_init_password' }]);
    await s.configService.update('cfg1', { value: MASKED_CONFIG_VALUE });
    expect(s.calls.some((call) => call.text.includes('UPDATE'))).toBe(false);
  });
});
