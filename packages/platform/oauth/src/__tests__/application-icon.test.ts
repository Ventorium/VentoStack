import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import type { StorageAdapter } from '@ventostack/oss';
import { createOAuthApplicationIconService } from '../services/application-icon';

describe('OAuth Application Icon', () => {
  test('validates image content and stores only a controlled URL', async () => {
    const writes: string[] = [];
    let update: Record<string, unknown> = {};
    const row = {
      id: 'app-1',
      status: 'ACTIVE',
      icon_storage_path: null,
      icon_mime_type: null,
    };
    const builder = {
      where: () => builder,
      get: async () => row,
      update: async (values: Record<string, unknown>) => {
        update = values;
      },
    };
    const storage = {
      write: async (path: string) => {
        writes.push(path);
      },
    } as unknown as StorageAdapter;
    const service = createOAuthApplicationIconService({
      db: { query: () => builder } as unknown as Database,
      storage,
      issuer: 'https://id.example/api/oauth',
    });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const result = await service.upload('app-1', 'icon.png', png);
    expect(writes[0]).toStartWith('oauth-icons/app-1/');
    expect(result.iconUrl).toBe('https://id.example/api/oauth/applications/app-1/icon');
    expect(update.icon_mime_type).toBe('image/png');
    expect(update.icon_url).toBe(result.iconUrl);
  });

  test('rejects extension and content mismatches', async () => {
    const builder = { where: () => builder, get: async () => ({ id: 'app-1', status: 'ACTIVE' }) };
    const service = createOAuthApplicationIconService({
      db: { query: () => builder } as unknown as Database,
      storage: {} as StorageAdapter,
      issuer: 'https://id.example/api/oauth',
    });
    await expect(service.upload('app-1', 'icon.png', Buffer.from('not an image'))).rejects.toThrow(
      '不匹配',
    );
  });
});
