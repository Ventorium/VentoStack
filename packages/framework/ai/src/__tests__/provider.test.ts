/**
 * provider.test.ts — AI 供应商与模型管理服务测试
 */
import { describe, expect, mock, test } from 'bun:test';
import { fetchModelsFromProviderApi } from '../services/provider-api-models';
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

// ============ Sync Models From Provider API ============

/** 临时替换 globalThis.fetch，返回还原函数；requests 记录每次请求的 url 与 init */
function installFetchMock(responses: Array<() => Response>) {
  const original = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const next = responses.shift();
    return next ? next() : new Response('[]', { status: 200 });
  }) as typeof fetch;
  return {
    requests,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

const providerRow = {
  id: 'p1',
  name: 'octopus',
  display_name: 'Octopus',
  api_format: 'openai_chat',
  base_url: 'https://octopus.xx/v1',
  api_key: 'ENC:sk-test',
  headers: null,
  extra: null,
  preset_id: null,
  models_dev_slug: null,
  status: 1,
  sort: 0,
  model_count: 0,
  created_at: new Date(),
  updated_at: new Date(),
};

describe('fetchModelsFromProviderApi', () => {
  test('parses openai {data:[...]} shape', async () => {
    const { restore } = installFetchMock([
      () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'gpt-4o', object: 'model' },
              { id: 'claude-3', object: 'model' },
            ],
          }),
          { status: 200 },
        ),
    ]);
    try {
      const models = await fetchModelsFromProviderApi(
        'https://octopus.xx/v1/',
        'sk-test',
        'openai_chat',
      );
      expect(models.length).toBe(2);
      expect(models.map((m) => m.modelId)).toContain('gpt-4o');
      expect(models[0].contextLength).toBe(128000);
      expect(models[0].supportsText).toBe(true);
    } finally {
      restore();
    }
  });

  test('accepts bare array and deduplicates by id', async () => {
    const { restore } = installFetchMock([
      () =>
        new Response(JSON.stringify([{ id: 'm1' }, { id: 'm1' }, { id: 'm2' }]), { status: 200 }),
    ]);
    try {
      const models = await fetchModelsFromProviderApi('https://x.xx/v1', 'sk', 'openai_chat');
      expect(models.length).toBe(2);
    } finally {
      restore();
    }
  });

  test('anthropic: paginates with after= and maps display_name', async () => {
    const { requests, restore } = installFetchMock([
      () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'claude-opus-4-6', display_name: 'Claude Opus' }],
            has_more: true,
            last_id: 'claude-opus-4-6',
          }),
          { status: 200 },
        ),
      () =>
        new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-4-6' }], has_more: false }), {
          status: 200,
        }),
    ]);
    try {
      const models = await fetchModelsFromProviderApi('https://api.anthropic.com/v1', 'sk', 'anthropic');
      expect(models.length).toBe(2);
      expect(models.find((m) => m.modelId === 'claude-opus-4-6')?.displayName).toBe('Claude Opus');
      expect(models.find((m) => m.modelId === 'claude-sonnet-4-6')?.displayName).toBe(
        'claude-sonnet-4-6',
      );
      // 第二页请求带 after 参数
      expect(requests[1]?.url).toContain('after=claude-opus-4-6');
      // 请求头使用 x-api-key
      const headers = requests[0]?.init?.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('sk');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    } finally {
      restore();
    }
  });

  test('throws on non-2xx response', async () => {
    const { restore } = installFetchMock([() => new Response('unauthorized', { status: 401 })]);
    try {
      await expect(
        fetchModelsFromProviderApi('https://x.xx/v1', 'sk-bad', 'openai_chat'),
      ).rejects.toThrow('Provider API returned 401');
    } finally {
      restore();
    }
  });

  test('throws when apiKey is empty', async () => {
    await expect(fetchModelsFromProviderApi('https://x.xx/v1', '', 'openai_chat')).rejects.toThrow(
      'no API key',
    );
  });
});

describe('syncModelsFromApi', () => {
  test('inserts fetched models', async () => {
    const { db, calls, mockRows } = createMockDb();
    mockRows.push([providerRow]); // getProviderById
    mockRows.push([{ base_url: 'https://octopus.xx/v1', api_key: 'ENC:sk-test', api_format: 'openai_chat' }]); // getProviderApiKey
    mockRows.push([]); // existing models

    const { restore } = installFetchMock([
      () => new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), { status: 200 }),
    ]);
    try {
      const service = createService(db);
      const result = await service.syncModelsFromApi('p1', 'default');
      expect(result.added).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.total).toBe(2);
      expect(calls.filter((c) => c.sql.includes('INSERT INTO ai_model')).length).toBe(2);
    } finally {
      restore();
    }
  });

  test('updates existing and preserves manual models', async () => {
    const { db, calls, mockRows } = createMockDb();
    mockRows.push([providerRow]); // getProviderById
    mockRows.push([{ base_url: 'https://octopus.xx/v1', api_key: 'ENC:sk-test', api_format: 'openai_chat' }]);
    mockRows.push([
      { id: 'db-1', model_id: 'm1' }, // 将被更新
      { id: 'db-2', model_id: 'manual-model' }, // 不在拉取结果中
    ]);
    mockRows.push([]); // UPDATE m1 的返回（被 shift 消耗）
    mockRows.push([{ auto_fetched: false }]); // manual-model 的 auto_fetched 检查

    const { restore } = installFetchMock([
      () => new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200 }),
    ]);
    try {
      const service = createService(db);
      const result = await service.syncModelsFromApi('p1', 'default');
      expect(result.added).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.removed).toBe(0); // 手动模型不被删除
      expect(calls.some((c) => c.sql.includes('UPDATE ai_model'))).toBe(true);
      expect(calls.some((c) => c.sql.includes('DELETE FROM ai_model'))).toBe(false);
    } finally {
      restore();
    }
  });

  test('removes stale auto_fetched models', async () => {
    const { db, calls, mockRows } = createMockDb();
    mockRows.push([providerRow]);
    mockRows.push([{ base_url: 'https://octopus.xx/v1', api_key: 'ENC:sk-test', api_format: 'openai_chat' }]);
    mockRows.push([{ id: 'db-1', model_id: 'stale-model' }]);
    mockRows.push([]); // INSERT m1 的返回（被 shift 消耗）
    mockRows.push([{ auto_fetched: true }]);

    const { restore } = installFetchMock([
      () => new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200 }),
    ]);
    try {
      const service = createService(db);
      const result = await service.syncModelsFromApi('p1', 'default');
      expect(result.removed).toBe(1);
      expect(calls.some((c) => c.sql.includes('DELETE FROM ai_model'))).toBe(true);
    } finally {
      restore();
    }
  });

  test('throws on empty model list without deleting', async () => {
    const { db, calls, mockRows } = createMockDb();
    mockRows.push([providerRow]);
    mockRows.push([{ base_url: 'https://octopus.xx/v1', api_key: 'ENC:sk-test', api_format: 'openai_chat' }]);

    const { restore } = installFetchMock([
      () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    ]);
    try {
      const service = createService(db);
      await expect(service.syncModelsFromApi('p1', 'default')).rejects.toThrow('no models');
      expect(calls.some((c) => c.sql.includes('DELETE FROM ai_model'))).toBe(false);
    } finally {
      restore();
    }
  });

  test('throws when provider not found', async () => {
    const { db, mockRows } = createMockDb();
    mockRows.push([]); // getProviderById returns empty
    const service = createService(db);
    await expect(service.syncModelsFromApi('p1', 'default')).rejects.toThrow('Provider not found');
  });
});
