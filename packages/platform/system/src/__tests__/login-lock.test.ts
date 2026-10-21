/**
 * @ventostack/system - 登录锁定策略单元测试
 *
 * 覆盖缓存键命名空间、剩余时间换算边界，以及锁定错误的 code/status/data 契约。
 */

import { describe, expect, test } from 'bun:test';
import {
  ACCOUNT_LOCKED_CODE,
  createAccountLockedError,
  loginFailKey,
  loginLockUntilKey,
  remainingLockMinutes,
} from '../services/login-lock';

describe('登录锁定策略', () => {
  test('缓存键包含租户命名空间，且不包含 IP（账号作用域）', () => {
    expect(loginFailKey('default', 'admin')).toBe('tenant:default:login_fail:admin');
    expect(loginLockUntilKey('default', 'admin')).toBe('tenant:default:login_locked_until:admin');
    // 不同租户必须隔离
    expect(loginFailKey('t1', 'admin')).not.toBe(loginFailKey('t2', 'admin'));
  });

  test('剩余分钟数向上取整且不少于 1 分钟', () => {
    expect(remainingLockMinutes(Date.now() + 121_000, 15)).toBe(3);
    expect(remainingLockMinutes(Date.now() + 60_000, 15)).toBe(1);
    // 不足 1 分钟仍提示 1 分钟，避免出现「请等待 0 分钟」
    expect(remainingLockMinutes(Date.now() + 1_000, 15)).toBe(1);
    expect(remainingLockMinutes(Date.now() + 900_000, 15)).toBe(15);
  });

  test('到期时间缺失、非法或已过期时的回退语义', () => {
    // 缓存键丢失/被清空：回退到配置的锁定时长
    expect(remainingLockMinutes(0, 15)).toBe(15);
    expect(remainingLockMinutes(Number.NaN, 15)).toBe(15);
    // 已过期：返回 0（调用方不会再判定为锁定）
    expect(remainingLockMinutes(Date.now() - 1_000, 15)).toBe(0);
  });

  test('锁定错误同时携带业务错误码与 HTTP 状态码', () => {
    const err = createAccountLockedError(7);
    expect(err.code).toBe(ACCOUNT_LOCKED_CODE);
    expect(err.status).toBe(401);
    expect(err.data).toEqual({ retryAfterMinutes: 7 });
  });
});
