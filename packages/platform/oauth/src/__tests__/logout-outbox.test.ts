import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import { createOAuthLogoutOutboxService } from '../services/logout-outbox';

describe('OAuth back-channel logout outbox', () => {
  test('returns immediately when no jobs are due', async () => {
    const service = createOAuthLogoutOutboxService({
      db: { raw: async () => [] } as unknown as Database,
      batchSize: 5,
    });
    expect(await service.deliverPending()).toBe(0);
  });

  test('retries unsafe endpoints and marks exhausted jobs failed', async () => {
    const updates: unknown[][] = [];
    let selected = false;
    const service = createOAuthLogoutOutboxService({
      db: {
        raw: async (sql: string, params: unknown[]) => {
          if (sql.includes('WITH selected') && !selected) {
            selected = true;
            return [
              { id: 'retry', endpoint: 'https://127.0.0.1/logout', payload: 'jwt', attempts: 1 },
              { id: 'failed', endpoint: 'http://example.com/logout', payload: 'jwt', attempts: 7 },
            ];
          }
          updates.push(params);
          return [];
        },
      } as unknown as Database,
    });
    expect(await service.deliverPending()).toBe(0);
    expect(updates[0]![1]).toBe('RETRY');
    expect(updates[1]![1]).toBe('FAILED');
  });
});
