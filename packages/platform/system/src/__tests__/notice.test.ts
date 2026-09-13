/**
 * @ventostack/system - NoticeService 测试
 */

import { describe, expect, test } from 'bun:test';
import { VentoStackError } from '@ventostack/core';
import { createNoticeService } from '../services/notice';
import { createMockDatabase, createMockExecutor } from './helpers';

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel, calls } = createMockDatabase(mockExec);
  registerModel('sys_notice', 'sys_notice', true);
  const noticeService = createNoticeService({ db, tenantId: 'default' });
  return { noticeService, executor: mockExec.executor, calls, results: mockExec.results };
}

describe('NoticeService', () => {
  test('create inserts notice with generated id', async () => {
    const s = setup();
    const result = await s.noticeService.create({
      title: '系统公告',
      content: '测试内容',
      type: 1,
    });
    expect(result.id).toBeTruthy();
    expect(s.calls.some((c) => c.text.includes('INSERT'))).toBe(true);
  });

  test('create and update reject unsupported notice types', async () => {
    const s = setup();
    await expect(
      s.noticeService.create({ title: '错误类型', content: '内容', type: 7 }),
    ).rejects.toMatchObject({ code: 400, errorCode: 'INVALID_NOTICE_TYPE' });
    await expect(s.noticeService.update('n1', { type: 0 })).rejects.toMatchObject({
      code: 400,
      errorCode: 'INVALID_NOTICE_TYPE',
    });
    expect(s.calls).toHaveLength(0);
  });

  test('update executes UPDATE with changed fields', async () => {
    const s = setup();
    s.results.set('UPDATE sys_notice', [{ id: 'n1', status: 0 }]);
    await s.noticeService.update('n1', { title: '新标题', status: 1 });
    expect(s.calls.some((c) => c.text.includes('UPDATE'))).toBe(true);
  });

  test('update with no fields does nothing', async () => {
    const s = setup();
    await s.noticeService.update('n1', {});
    expect(s.calls.length).toBe(0);
  });

  test('delete performs soft delete', async () => {
    const s = setup();
    s.results.set('SELECT status FROM sys_notice', [{ status: 0 }]);
    await s.noticeService.delete('n1');
    expect(s.calls.some((c) => c.text.includes('deleted_at'))).toBe(true);
  });

  test('list returns paginated results', async () => {
    const s = setup();
    s.results.set('COUNT', [{ count: 2 }]);
    s.results.set('SELECT', [
      {
        id: 'n1',
        title: '公告1',
        content: '内容1',
        type: 1,
        status: 1,
        publisher_id: 'u1',
        publish_at: '2025-01-01',
      },
      {
        id: 'n2',
        title: '公告2',
        content: '内容2',
        type: 2,
        status: 0,
        publisher_id: null,
        publish_at: null,
      },
    ]);
    const result = await s.noticeService.list({ page: 1, pageSize: 10 });
    expect(result.items.length).toBe(2);
    expect(result.total).toBe(2);
  });

  test('list with empty result returns zero items', async () => {
    const s = setup();
    s.results.set('COUNT', [{ count: 0 }]);
    const result = await s.noticeService.list();
    expect(result.items.length).toBe(0);
    expect(result.total).toBe(0);
  });

  test('publish updates status to 1', async () => {
    const s = setup();
    s.results.set('SELECT', [{ status: 0 }]);
    s.results.set('UPDATE sys_notice', [{ id: 'n1', status: 1 }]);
    await s.noticeService.publishApproved('n1', 'u1');
    expect(s.calls.some((c) => c.text.includes('status') && c.text.includes('publisher_id'))).toBe(
      true,
    );
  });

  test('approved publish is idempotent when notice is already published', async () => {
    const { noticeService, results, calls } = setup();
    results.set('SELECT', [{ status: 1 }]);

    await noticeService.publishApproved('n1', 'approver-1');

    expect(calls.some((c) => c.text.includes('UPDATE'))).toBe(false);
  });

  test('revoke updates status to 2', async () => {
    const s = setup();
    s.results.set('UPDATE sys_notice', [{ id: 'n1', status: 2 }]);
    await s.noticeService.revoke('n1');
    expect(s.calls.some((c) => c.text.includes('status'))).toBe(true);
  });

  test('markRead inserts user-notice record', async () => {
    const s = setup();
    await s.noticeService.markRead('u1', 'n1');
    expect(s.calls.some((c) => c.text.includes('sys_user_notice'))).toBe(true);
  });

  test('getUnreadCount returns count', async () => {
    const s = setup();
    s.results.set('COUNT', [{ cnt: 5 }]);
    const count = await s.noticeService.getUnreadCount('u1');
    expect(count).toBe(5);
  });

  test('getUnreadCount returns 0 when no unread', async () => {
    const s = setup();
    const count = await s.noticeService.getUnreadCount('u1');
    expect(count).toBe(0);
  });

  test('list filters by title', async () => {
    const s = setup();
    s.results.set('COUNT', [{ count: 1 }]);
    s.results.set('SELECT', [{ id: 'n1', title: '维护公告', content: 'c', type: 1, status: 0 }]);
    const result = await s.noticeService.list({ title: '维护' });
    expect(result.total).toBe(1);
    const selectCall = s.calls.find((c) => c.text.includes('COUNT'));
    expect(selectCall?.params).toContain('%维护%');
  });

  // ===== 状态机错误码回归：不存在 → 404；状态冲突 → 409 =====

  test('update on missing notice throws 404', async () => {
    const s = setup();
    s.results.set('UPDATE sys_notice', []);
    let error: unknown;
    try {
      await s.noticeService.update('n404', { title: 'x' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VentoStackError);
    expect((error as VentoStackError).code).toBe(404);
  });

  test('update on published notice throws 409', async () => {
    const s = setup();
    s.results.set('UPDATE sys_notice', []);
    s.results.set('SELECT status FROM sys_notice', [{ status: 1 }]);
    let error: unknown;
    try {
      await s.noticeService.update('n1', { title: 'x' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VentoStackError);
    expect((error as VentoStackError).code).toBe(409);
    expect((error as VentoStackError).message).toBe('仅草稿状态的通知可编辑');
  });

  test('approved publish rejects an invalid notice state', async () => {
    const s = setup();
    s.results.set('SELECT', [{ status: 9 }]);
    s.results.set('UPDATE sys_notice', []);
    let error: unknown;
    try {
      await s.noticeService.publishApproved('n1', 'u1');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VentoStackError);
    expect((error as VentoStackError).code).toBe(409);
  });

  test('publish on missing notice throws 404', async () => {
    const s = setup();
    s.results.set('UPDATE sys_notice', []);
    let error: unknown;
    try {
      await s.noticeService.publishApproved('n404', 'u1');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VentoStackError);
    expect((error as VentoStackError).code).toBe(404);
  });

  test('revoke on draft notice throws 409', async () => {
    const s = setup();
    s.results.set('UPDATE sys_notice', []);
    s.results.set('SELECT status FROM sys_notice', [{ status: 0 }]);
    let error: unknown;
    try {
      await s.noticeService.revoke('n1');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VentoStackError);
    expect((error as VentoStackError).code).toBe(409);
    expect((error as VentoStackError).message).toBe('仅已发布状态的通知可撤回');
  });

  test('revoke on missing notice throws 404', async () => {
    const s = setup();
    s.results.set('UPDATE sys_notice', []);
    let error: unknown;
    try {
      await s.noticeService.revoke('n404');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VentoStackError);
    expect((error as VentoStackError).code).toBe(404);
  });

  test('delete published notice throws 409', async () => {
    const s = setup();
    s.results.set('SELECT status FROM sys_notice', [{ status: 1 }]);
    let error: unknown;
    try {
      await s.noticeService.delete('n1');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VentoStackError);
    expect((error as VentoStackError).code).toBe(409);
    expect((error as VentoStackError).message).toBe('已发布通知必须先撤回');
  });

  test('delete missing notice throws 404', async () => {
    const s = setup();
    s.results.set('SELECT status FROM sys_notice', []);
    let error: unknown;
    try {
      await s.noticeService.delete('n404');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(VentoStackError);
    expect((error as VentoStackError).code).toBe(404);
  });
});
