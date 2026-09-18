import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import { createOAuthAuthLogService } from '../services/auth-log';

describe('OAuth authentication log service', () => {
  test('writes a redacted structured event under the trusted tenant', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const service = createOAuthAuthLogService({
      db: {
        raw: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          return [];
        },
      } as unknown as Database,
      tenantId: 'tenant-1',
    });
    await service.append({
      eventType: 'TOKEN_REFRESH',
      success: false,
      failureCode: 'invalid_grant',
      userAgent: 'x'.repeat(600),
      metadata: { grant: 'refresh_token' },
    });
    expect(calls[0]!.params[1]).toBe('tenant-1');
    expect((calls[0]!.params[11] as string).length).toBe(512);
    expect(calls[0]!.params[12]).toBe('{"grant":"refresh_token"}');
  });

  test('captures the application name and identifier snapshot from the client id', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const service = createOAuthAuthLogService({
      db: {
        raw: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          if (sql.includes('FROM oauth_application'))
            return [{ id: 'app-1', name: '智能对账', identifier: 'reconcile' }];
          return [];
        },
      } as unknown as Database,
      tenantId: 'tenant-1',
    });
    await service.append({ eventType: 'CODE_EXCHANGED', success: true, clientId: 'vs_client' });
    const lookup = calls.find((call) => call.sql.includes('FROM oauth_application'))!;
    // 已禁用或已删除的 Application 仍需留下快照，因此不得按 status/enabled 过滤
    expect(lookup.sql).not.toContain('status');
    expect(lookup.sql).not.toContain('enabled');
    const insert = calls.find((call) => call.sql.includes('INSERT INTO oauth_auth_log'))!;
    expect(insert.params[3]).toBe('app-1');
    expect(insert.params[4]).toBe('vs_client');
    expect(insert.params[5]).toBe('智能对账');
    expect(insert.params[6]).toBe('reconcile');
  });

  test('still writes the event when the application snapshot lookup fails', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const service = createOAuthAuthLogService({
      db: {
        raw: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params });
          if (sql.includes('FROM oauth_application')) throw new Error('connection lost');
          return [];
        },
      } as unknown as Database,
      tenantId: 'tenant-1',
    });
    await service.append({ eventType: 'CODE_EXCHANGED', success: true, clientId: 'vs_client' });
    const insert = calls.find((call) => call.sql.includes('INSERT INTO oauth_auth_log'))!;
    expect(insert.params[4]).toBe('vs_client');
    expect(insert.params[5]).toBeNull();
  });

  test('lists tenant-scoped events with every supported filter', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const service = createOAuthAuthLogService({
      db: {
        raw: async (sql: string, params: unknown[]) => {
          calls.push({ sql, params: [...params] });
          return sql.includes('COUNT') ? [{ count: '2' }] : [{ id: 'log-1' }];
        },
      } as unknown as Database,
      tenantId: 'tenant-1',
    });
    const result = await service.list({
      page: 2,
      pageSize: 20,
      eventType: 'SSO_LOGIN',
      success: true,
      clientId: 'client-1',
      userId: 'user-1',
      startAt: new Date('2026-01-01'),
      endAt: new Date('2026-01-02'),
    });
    expect(result).toMatchObject({ total: 2, page: 2, pageSize: 20 });
    expect(calls[0]!.sql).toContain('tenant_id=$1');
    expect(calls[1]!.params.slice(-2)).toEqual([20, 20]);
  });
});
