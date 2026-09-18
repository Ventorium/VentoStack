import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import type { StorageAdapter } from '@ventostack/oss';
import { createOAuthApplicationService } from '../services/application';

const PEPPER = 'test-only-oauth-secret-pepper-32-bytes-minimum';
const storage = {} as StorageAdapter;
const appDeps = { storage, issuer: 'https://id.test/api/oauth' };

function createCaptureDatabase(): {
  db: Database;
  inserts: Array<Record<string, unknown>>;
} {
  const inserts: Array<Record<string, unknown>> = [];
  const builder = {
    async insert(data: Record<string, unknown>): Promise<void> {
      inserts.push(data);
    },
  };
  return {
    db: { query: () => builder } as unknown as Database,
    inserts,
  };
}

function validInput() {
  return {
    identifier: 'reconcile',
    name: '智能对账',
    homepageUrl: 'https://app.company.test/',
    redirectUri: 'https://app.company.test/oauth/callback',
    allowedScopes: ['openid', 'profile', 'context'],
  };
}

describe('OAuthApplicationService', () => {
  test('creates a confidential client and stores only a secret digest', async () => {
    const capture = createCaptureDatabase();
    const service = createOAuthApplicationService({
      db: capture.db,
      secretPepper: PEPPER,
      ...appDeps,
    });

    const result = await service.create(validInput());

    expect(result.clientId).toStartWith('vs_');
    expect(result.clientSecret.length).toBeGreaterThanOrEqual(43);
    expect(capture.inserts).toHaveLength(1);
    expect(capture.inserts[0]?.client_secret_digest).not.toBe(result.clientSecret);
    expect(capture.inserts[0]).not.toHaveProperty('client_secret');
  });

  test('rejects non-HTTPS redirect URIs outside the development loopback exception', async () => {
    const capture = createCaptureDatabase();
    const service = createOAuthApplicationService({
      db: capture.db,
      secretPepper: PEPPER,
      ...appDeps,
    });

    await expect(
      service.create({ ...validInput(), redirectUri: 'http://app.company.test/callback' }),
    ).rejects.toThrow('HTTPS');
    expect(capture.inserts).toHaveLength(0);
  });

  test('requires an explicit offline-access application flag', async () => {
    const capture = createCaptureDatabase();
    const service = createOAuthApplicationService({
      db: capture.db,
      secretPepper: PEPPER,
      ...appDeps,
    });

    await expect(
      service.create({ ...validInput(), allowedScopes: ['openid', 'offline_access'] }),
    ).rejects.toThrow('离线访问');
  });

  test('allows loopback HTTP only when the development option is enabled', async () => {
    const capture = createCaptureDatabase();
    const service = createOAuthApplicationService({
      db: capture.db,
      secretPepper: PEPPER,
      ...appDeps,
      allowLoopbackHttp: true,
    });

    await service.create({
      ...validInput(),
      homepageUrl: 'http://127.0.0.1:3000/',
      redirectUri: 'http://127.0.0.1:3000/callback',
    });
    expect(capture.inserts).toHaveLength(1);
  });

  test('rejects a secret pepper shorter than 256 bits', () => {
    const capture = createCaptureDatabase();
    expect(() =>
      createOAuthApplicationService({ db: capture.db, secretPepper: 'too-short', ...appDeps }),
    ).toThrow('32 bytes');
  });

  test('lists, reads, updates and rotates an existing application', async () => {
    const row: Record<string, unknown> = {
      id: 'app-1',
      identifier: 'reconcile',
      name: '智能对账',
      description: null,
      icon_url: null,
      icon_storage_path: null,
      icon_mime_type: null,
      homepage_url: 'https://app.example/',
      redirect_uri: 'https://app.example/callback',
      post_logout_redirect_uri: null,
      backchannel_logout_uri: null,
      backchannel_logout_session_required: true,
      client_id: 'client-1',
      client_secret_digest: 'old-digest',
      client_secret_version: 1,
      allowed_scopes: 'openid profile',
      offline_access_enabled: false,
      enabled: true,
      sort: 0,
      status: 'ACTIVE',
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
    };
    const builder = {
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      offset: () => builder,
      get: async () => ({ ...row }),
      list: async () => [row],
      count: async () => 1,
      update: async (values: Record<string, unknown>) => Object.assign(row, values),
    };
    const db = { query: () => builder } as unknown as Database;
    const service = createOAuthApplicationService({
      db,
      secretPepper: PEPPER,
      ...appDeps,
    });
    expect((await service.list({ page: 1, pageSize: 10 })).items[0]).toMatchObject({
      id: 'app-1',
      allowedScopes: ['openid', 'profile'],
    });
    expect(await service.getById('app-1')).toMatchObject({ clientId: 'client-1' });
    await service.update('app-1', {
      name: '新名称',
      homepageUrl: 'https://new.example/',
      enabled: false,
      sort: 10,
    });
    expect(row).toMatchObject({ name: '新名称', status: 'DISABLED', sort: 10 });
    const secret = await service.regenerateSecret('app-1');
    expect(secret.clientSecret).toBeString();
    expect(row.client_secret_version).toBe(2);
    expect(row.client_secret_digest).not.toBe('old-digest');
  });

  test('tombstones an application, revokes credentials and removes its icon', async () => {
    const row: Record<string, unknown> = {
      id: 'app-1',
      status: 'ACTIVE',
      icon_storage_path: 'oauth-icons/app-1/icon.png',
      client_secret_version: 1,
    };
    const rawCalls: string[] = [];
    const builder = {
      where: () => builder,
      get: async () => ({ ...row }),
      update: async (values: Record<string, unknown>) => Object.assign(row, values),
      delete: async () => undefined,
    };
    const db = {
      query: () => builder,
      raw: async (sql: string) => {
        rawCalls.push(sql);
        return [];
      },
      transaction: async (fn: (tx: Database) => Promise<void>) => fn(db as Database),
    } as unknown as Database;
    const removed: string[] = [];
    const service = createOAuthApplicationService({
      db,
      secretPepper: PEPPER,
      storage: { delete: async (path: string) => removed.push(path) } as unknown as StorageAdapter,
      issuer: appDeps.issuer,
    });
    await service.delete('app-1');
    expect(row.status).toBe('DELETED');
    expect(row.client_secret_digest).toBe('');
    expect(rawCalls).toHaveLength(4);
    expect(removed).toEqual(['oauth-icons/app-1/icon.png']);
  });
});
