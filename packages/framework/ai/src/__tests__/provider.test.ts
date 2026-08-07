/**
 * provider.test.ts — AI 供应商与模型管理服务测试
 */
import { describe, expect, mock, test } from 'bun:test';
import { createProviderService } from '../services/provider';
import { getPresetById, getPresets } from '../services/provider-presets';

// ============ Presets ============

describe('ProviderPresets', () => {
  test('getPresets returns 21 presets', () => {
    const presets = getPresets();
    expect(presets.length).toBe(21);
  });

  test('each preset has required fields', () => {
    for (const p of getPresets()) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.displayName).toBeTruthy();
      expect(p.apiFormat).toBeTruthy();
      expect(['openai_chat', 'openai_response', 'anthropic', 'custom']).toContain(p.apiFormat);
    }
  });

  test('getPresetById returns correct preset', () => {
    const p = getPresetById('openai');
    expect(p).toBeTruthy();
    expect(p!.displayName).toBe('OpenAI');
    expect(p!.apiFormat).toBe('openai_chat');
    expect(p!.modelsDevSlug).toBe('openai');
  });

  test('getPresetById returns undefined for unknown id', () => {
    expect(getPresetById('nonexistent')).toBeUndefined();
  });

  test('presets with modelsDevSlug have correct slugs', () => {
    const withSlug = getPresets().filter((p) => p.modelsDevSlug);
    expect(withSlug.length).toBeGreaterThanOrEqual(6);
    expect(withSlug.map((p) => p.modelsDevSlug)).toContain('openai');
    expect(withSlug.map((p) => p.modelsDevSlug)).toContain('anthropic');
    expect(withSlug.map((p) => p.modelsDevSlug)).toContain('deepseek');
  });

  test('custom presets have empty baseUrl', () => {
    const custom = getPresets().filter((p) => p.id.startsWith('custom_'));
    expect(custom.length).toBe(2);
    for (const p of custom) {
      expect(p.baseUrl).toBe('');
    }
  });
});

// ============ Provider Service ============

function createMockDb() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const mockRows: unknown[][] = [];

  const db = {
    raw: mock(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      // Return the next mock result
      return mockRows.shift() ?? [];
    }),
    query: mock(() => ({})),
  };

  return { db: db as any, calls, mockRows };
}

const credentialEncryptor = {
  encrypt: async (value: string) => `ENC:${value}`,
  decrypt: async (value: string) => value.slice(4),
  isEncrypted: (value: string) => value.startsWith('ENC:'),
};

function createService(db: ReturnType<typeof createMockDb>['db']) {
  return createProviderService({ db, credentialEncryptor });
}

describe('ProviderService', () => {
  test('createProvider calls INSERT', async () => {
    const { db, calls } = createMockDb();
    const service = createService(db);
    const result = await service.createProvider('default', {
      name: 'openai',
      displayName: 'OpenAI',
      apiFormat: 'openai_chat',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      presetId: 'openai',
    });
    expect(result.id).toBeTruthy();
    expect(calls.some((c) => c.sql.includes('INSERT INTO ai_provider'))).toBe(true);
    expect(calls[0]?.params).toContain('ENC:sk-test');
  });

  test('updateProvider with no fields does nothing', async () => {
    const { db, calls } = createMockDb();
    const service = createService(db);
    await service.updateProvider('p1', 'default', {});
    expect(calls.length).toBe(0);
  });

  test('updateProvider with fields calls UPDATE', async () => {
    const { db, calls } = createMockDb();
    const service = createService(db);
    await service.updateProvider('p1', 'default', { displayName: 'New Name', status: 0 });
    expect(calls.some((c) => c.sql.includes('UPDATE ai_provider'))).toBe(true);
  });

  test('deleteProvider calls DELETE', async () => {
    const { db, calls } = createMockDb();
    const service = createService(db);
    await service.deleteProvider('p1', 'default');
    expect(calls.some((c) => c.sql.includes('DELETE FROM ai_provider'))).toBe(true);
  });

  test('listProviders calls SELECT', async () => {
    const { db, calls, mockRows } = createMockDb();
    mockRows.push([
      {
        id: 'p1',
        name: 'openai',
        display_name: 'OpenAI',
        api_format: 'openai_chat',
        base_url: 'https://api.openai.com/v1',
        api_key: 'sk-xxx',
        headers: null,
        extra: null,
        preset_id: 'openai',
        status: 1,
        sort: 0,
        model_count: 5,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    const service = createService(db);
    const result = await service.listProviders('default');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('openai');
    expect(result[0].modelCount).toBe(5);
    expect(result[0].apiKey).toBe('');
    expect(result[0].hasApiKey).toBe(true);
    expect(calls.some((c) => c.sql.includes('FROM ai_provider'))).toBe(true);
  });

  test('getConfig calls SELECT', async () => {
    const { db, calls, mockRows } = createMockDb();
    mockRows.push([{ config_value: 'openai/gpt-4o' }]);
    const service = createService(db);
    const val = await service.getConfig('default_model');
    expect(val).toBe('openai/gpt-4o');
  });

  test('getConfig returns null when not found', async () => {
    const { db } = createMockDb();
    const service = createService(db);
    const val = await service.getConfig('nonexistent');
    expect(val).toBeNull();
  });

  test('setConfig calls INSERT ON CONFLICT', async () => {
    const { db, calls } = createMockDb();
    const service = createService(db);
    await service.setConfig('default_model', 'openai/gpt-4o');
    expect(calls.some((c) => c.sql.includes('ON CONFLICT'))).toBe(true);
  });

  test('resolveRuntimeModel decrypts credentials', async () => {
    const { db, mockRows } = createMockDb();
    mockRows.push([
      {
        provider_name: 'openai',
        api_format: 'openai_chat',
        base_url: 'https://api.openai.com/v1',
        api_key: 'ENC:sk-runtime',
        headers: null,
        model_id: 'gpt-4o',
      },
    ]);
    const service = createService(db);
    const result = await service.resolveRuntimeModel('openai/gpt-4o', 'default');
    expect(result?.providerName).toBe('openai');
    expect(result?.modelId).toBe('gpt-4o');
    expect(result?.apiKey).toBe('sk-runtime');
  });

  test('syncModels throws when provider not found', async () => {
    const { db, mockRows } = createMockDb();
    mockRows.push([]); // getProviderById returns empty
    const service = createService(db);
    await expect(service.syncModels('p1', 'default')).rejects.toThrow('Provider not found');
  });

  test('syncModels throws when provider has no preset', async () => {
    const { db, mockRows } = createMockDb();
    mockRows.push([
      {
        id: 'p1',
        name: 'custom',
        display_name: 'Custom',
        api_format: 'openai_chat',
        base_url: 'http://localhost',
        api_key: 'k',
        headers: null,
        extra: null,
        preset_id: null,
        status: 1,
        sort: 0,
        model_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    const service = createService(db);
    await expect(service.syncModels('p1', 'default')).rejects.toThrow(
      'Provider has no models.dev slug configured',
    );
  });
});
