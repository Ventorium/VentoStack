/**
 * @ventostack/system - 登录接口锁定提示测试
 *
 * 回归背景：锁定错误此前抛的是普通 Error，被 safeErrorMessage 统一替换成笼统的「登录失败」，
 * 用户无法区分「密码错误」与「账号被锁定」，也不知道要等多久。锁定必须返回明确文案 + 剩余分钟数。
 */

import { describe, expect, test } from 'bun:test';
import type { Middleware } from '@ventostack/core';
import { createAuthRoutes } from '../routes/auth';
import { createAuthService } from '../services/auth';
import { loginFailKey, loginLockUntilKey } from '../services/login-lock';
import {
  createMockAuditStore,
  createMockAuthSessionManager,
  createMockConfigService,
  createMockDatabase,
  createMockEventBus,
  createMockExecutor,
  createMockJWTManager,
  createMockPasswordHasher,
  createMockTOTPManager,
  createTestCache,
} from './helpers';

const passThrough: Middleware = async (_ctx, next) => next();

function setup() {
  const mockExec = createMockExecutor();
  const { db, registerModel } = createMockDatabase(mockExec);
  registerModel('sys_user', 'sys_user', true);
  registerModel('sys_user_role', 'sys_user_role', false);
  registerModel('sys_role', 'sys_role', true);
  registerModel('sys_login_log', 'sys_login_log', false);
  const cache = createTestCache();
  const passwordHasher = createMockPasswordHasher();
  mockExec.results.set('SELECT', [
    {
      id: 'u1',
      username: 'admin',
      password_hash: 'hashed_admin123',
      status: 1,
      mfa_enabled: false,
      mfa_secret: null,
      blacklisted: false,
      locked_until: null,
      login_attempts: 0,
      password_changed_at: null,
    },
  ]);

  const authService = createAuthService({
    db,
    cache,
    jwt: createMockJWTManager(),
    jwtSecret: 'test-secret-32-bytes-long-enough!!',
    passwordHasher,
    totp: createMockTOTPManager(),
    authSessionManager: createMockAuthSessionManager(),
    auditStore: createMockAuditStore(),
    eventBus: createMockEventBus(),
    configService: createMockConfigService(),
    tenantId: 'default',
  });

  const router = createAuthRoutes(authService, passThrough, () => passThrough);
  return { router, compiled: router.compile(), cache, passwordHasher };
}

/** 构造登录请求 */
function loginRequest(password = 'wrong-password') {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password }),
  });
}

describe('POST /api/auth/login 锁定提示', () => {
  test('连续失败达阈值后返回明确的锁定文案与剩余分钟数，而不是笼统的「登录失败」', async () => {
    const s = setup();
    const handler = s.compiled['/api/auth/login']?.POST;
    expect(handler).toBeDefined();

    // 前 5 次失败：达到 sys_login_max_attempts（默认 5）
    for (let i = 0; i < 5; i++) {
      const response = await handler!(loginRequest());
      expect(response.status).toBe(401);
    }

    // 第 6 次：即使密码正确，也应返回锁定提示与剩余等待时间
    const response = await handler!(loginRequest('admin123'));
    expect(response.status).toBe(401);
    const body = (await response.json()) as {
      message?: string;
      data?: { code?: string; retryAfterMinutes?: number };
    };
    expect(body.message).toBe('账号登录失败已锁定，请等待 15 分钟后重试');
    expect(body.data?.code).toBe('account_locked');
    expect(body.data?.retryAfterMinutes).toBe(15);
  });

  test('剩余分钟数按锁定到期时间计算，而非固定返回锁定时长', async () => {
    const s = setup();
    const handler = s.compiled['/api/auth/login']?.POST;
    // 锁定还剩 2 分 1 秒 → 向上取整为 3 分钟
    await s.cache.set(loginFailKey('default', 'admin'), 5, { ttl: 900 });
    await s.cache.set(loginLockUntilKey('default', 'admin'), Date.now() + 121_000, { ttl: 900 });

    const response = await handler!(loginRequest('admin123'));
    const body = (await response.json()) as {
      message?: string;
      data?: { retryAfterMinutes?: number };
    };
    expect(response.status).toBe(401);
    expect(body.data?.retryAfterMinutes).toBe(3);
    expect(body.message).toContain('请等待 3 分钟');
  });

  test('密码错误时仍返回通用文案，不泄露账号是否存在', async () => {
    const s = setup();
    const handler = s.compiled['/api/auth/login']?.POST;
    const response = await handler!(loginRequest('wrong-password'));
    const body = (await response.json()) as { message?: string; data?: unknown };
    expect(response.status).toBe(401);
    expect(body.message).toBe('用户名或密码错误');
    expect(body.data).toBeNull();
  });
});

describe('POST /api/auth/login 响应契约', () => {
  test('401 声明为 configured response（必须含 contentType，否则 OpenAPI 会退化成字段表）', () => {
    const s = setup();
    const route = s.router
      .routes()
      .find((r) => r.path === '/api/auth/login' && r.method === 'POST');
    expect(route).toBeDefined();

    const responses = (route?.schemaConfig as { responses?: Record<string, unknown> } | undefined)
      ?.responses;
    const unauthorized = responses?.['401'] as
      | { contentType?: string; description?: string; schema?: Record<string, unknown> }
      | undefined;
    expect(unauthorized?.contentType).toBe('application/json');
    expect(unauthorized?.description).toContain('account_locked');
    // data 不能进 schema：声明即启用响应校验，而通用失败分支的 data 为 null（SchemaField 无 nullable）
    expect(Object.keys(unauthorized?.schema ?? {})).toEqual(['code', 'message']);
    expect(unauthorized?.description).toContain('retryAfterMinutes');

    // 端点描述须说明锁定策略，供前端与文档对齐
    const openapiMeta = (route?.metadata as { openapi?: { description?: string } } | undefined)
      ?.openapi;
    expect(openapiMeta?.description).toContain('sys_login_max_attempts');
  });
});
