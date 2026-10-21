import { describe, expect, test } from 'bun:test';
import { sign as cryptoSign, generateKeyPairSync } from 'node:crypto';
import {
  ExpertHubError,
  type HubManifest,
  createExpertHubService,
  sha256Hex,
} from '../../services/expert-hub';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const validMeta = {
  slug: 'backend-architect',
  categoryId: '01-engineering',
  name: '后端架构师',
  description: '专注高并发系统设计',
  promptFile: 'backend-architect.md',
  version: '1.0.0',
  sha256: sha256Hex('hello expert'),
  expertType: 'agent' as const,
  updatedAt: '2026-10-18T00:00:00Z',
};

const validManifest: HubManifest = {
  version: '1.0.0',
  lastUpdated: '2026-10-18T00:00:00Z',
  categories: [{ id: '01-engineering', name: '技术工程' }],
  experts: [validMeta],
};

function hubWith(responses: Map<string, Response>) {
  return createExpertHubService({
    baseUrl: 'https://hub.test/files/',
    fetchImpl: (async (url: string) => {
      const resp = responses.get(String(url));
      if (!resp) return new Response('not found', { status: 404 });
      return resp;
    }) as typeof fetch,
  });
}

describe('createExpertHubService', () => {
  test('fetchManifest 返回合法 manifest', async () => {
    const hub = hubWith(
      new Map([['https://hub.test/files/manifest.json', jsonResponse(validManifest)]]),
    );
    const manifest = await hub.fetchManifest();
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.experts).toHaveLength(1);
    expect(manifest.experts[0]!.slug).toBe('backend-architect');
  });

  test('fetchManifest 拒绝未知字段', async () => {
    const hub = hubWith(
      new Map([
        ['https://hub.test/files/manifest.json', jsonResponse({ ...validManifest, evil: true })],
      ]),
    );
    expect(hub.fetchManifest()).rejects.toThrow(ExpertHubError);
  });

  test('fetchManifest 拒绝非法 slug', async () => {
    const hub = hubWith(
      new Map([
        [
          'https://hub.test/files/manifest.json',
          jsonResponse({
            ...validManifest,
            experts: [{ ...validMeta, slug: '../evil' }],
          }),
        ],
      ]),
    );
    expect(hub.fetchManifest()).rejects.toThrow(ExpertHubError);
  });

  test('fetchManifest 拒绝引用未定义分类', async () => {
    const hub = hubWith(
      new Map([
        [
          'https://hub.test/files/manifest.json',
          jsonResponse({
            ...validManifest,
            experts: [{ ...validMeta, categoryId: '99-nope' }],
          }),
        ],
      ]),
    );
    expect(hub.fetchManifest()).rejects.toThrow(ExpertHubError);
  });

  test('fetchManifest 拒绝穿越路径的 promptFile', async () => {
    const hub = hubWith(
      new Map([
        [
          'https://hub.test/files/manifest.json',
          jsonResponse({
            ...validManifest,
            experts: [{ ...validMeta, promptFile: 'experts/../../etc/passwd' }],
          }),
        ],
      ]),
    );
    expect(hub.fetchManifest()).rejects.toThrow(ExpertHubError);
  });

  test('fetchPrompt 通过 sha256 校验', async () => {
    const hub = hubWith(
      new Map([
        ['https://hub.test/files/manifest.json', jsonResponse(validManifest)],
        ['https://hub.test/files/backend-architect.md', new Response('hello expert')],
      ]),
    );
    const prompt = await hub.fetchPrompt(validMeta);
    expect(prompt).toBe('hello expert');
  });

  test('fetchPrompt 在 sha256 不符时拒绝', async () => {
    const hub = hubWith(
      new Map([['https://hub.test/files/backend-architect.md', new Response('tampered')]]),
    );
    expect(hub.fetchPrompt(validMeta)).rejects.toThrow(/sha256/);
  });

  test('manifest 缓存生效（第二次不发请求）', async () => {
    let hits = 0;
    const hub = createExpertHubService({
      baseUrl: 'https://hub.test/files/',
      fetchImpl: (async () => {
        hits++;
        return jsonResponse(validManifest);
      }) as typeof fetch,
    });
    await hub.fetchManifest();
    await hub.fetchManifest();
    expect(hits).toBe(1);
    // force 绕过缓存
    await hub.fetchManifest(true);
    expect(hits).toBe(2);
  });

  // ---- team 校验 ----

  const memberMeta = { ...validMeta, slug: 'code-reviewer', promptFile: 'code-reviewer.md' };

  test('fetchManifest 接受合法 team（成员存在且为 agent）', async () => {
    const hub = hubWith(
      new Map([
        [
          'https://hub.test/files/manifest.json',
          jsonResponse({
            ...validManifest,
            experts: [
              memberMeta,
              {
                ...validMeta,
                slug: 'quality-team',
                expertType: 'team',
                members: ['code-reviewer'],
              },
            ],
          }),
        ],
      ]),
    );
    const manifest = await hub.fetchManifest();
    const team = manifest.experts.find((e) => e.slug === 'quality-team');
    expect(team?.expertType).toBe('team');
    expect(team?.members).toEqual(['code-reviewer']);
  });

  test('fetchManifest 拒绝缺 members 的 team', async () => {
    const hub = hubWith(
      new Map([
        [
          'https://hub.test/files/manifest.json',
          jsonResponse({
            ...validManifest,
            experts: [{ ...validMeta, slug: 'quality-team', expertType: 'team' }],
          }),
        ],
      ]),
    );
    expect(hub.fetchManifest()).rejects.toThrow(/members/);
  });

  test('fetchManifest 拒绝带 members 的 agent', async () => {
    const hub = hubWith(
      new Map([
        [
          'https://hub.test/files/manifest.json',
          jsonResponse({
            ...validManifest,
            experts: [{ ...validMeta, members: ['code-reviewer'] }],
          }),
        ],
      ]),
    );
    expect(hub.fetchManifest()).rejects.toThrow(/members/);
  });

  test('fetchManifest 拒绝引用不存在成员的 team', async () => {
    const hub = hubWith(
      new Map([
        [
          'https://hub.test/files/manifest.json',
          jsonResponse({
            ...validManifest,
            experts: [
              { ...validMeta, slug: 'quality-team', expertType: 'team', members: ['ghost'] },
            ],
          }),
        ],
      ]),
    );
    expect(hub.fetchManifest()).rejects.toThrow(/ghost/);
  });

  test('fetchManifest 拒绝嵌套 team 成员', async () => {
    const hub = hubWith(
      new Map([
        [
          'https://hub.test/files/manifest.json',
          jsonResponse({
            ...validManifest,
            experts: [
              validMeta,
              {
                ...validMeta,
                slug: 'inner-team',
                expertType: 'team',
                members: ['backend-architect'],
              },
              { ...validMeta, slug: 'outer-team', expertType: 'team', members: ['inner-team'] },
            ],
          }),
        ],
      ]),
    );
    expect(hub.fetchManifest()).rejects.toThrow(/agent/);
  });

  // ---- manifest 签名 ----

  test('配置公钥后：正确签名通过、篡改与缺失签名 fail-closed', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const pubHex = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer)
      .subarray(-32)
      .toString('hex');
    const bytes = new TextEncoder().encode(JSON.stringify(validManifest));
    const sigHex = cryptoSign(null, bytes, privateKey).toString('hex');

    const makeHub = (sigResponse: Response) =>
      createExpertHubService({
        baseUrl: 'https://hub.test/files/',
        signingPubkey: pubHex,
        fetchImpl: (async (url: string) => {
          if (String(url).endsWith('manifest.sig')) return sigResponse;
          return jsonResponse(validManifest);
        }) as typeof fetch,
      });

    const ok = await makeHub(new Response(sigHex)).fetchManifest();
    expect(ok.version).toBe('1.0.0');

    const tampered = createExpertHubService({
      baseUrl: 'https://hub.test/files/',
      signingPubkey: pubHex,
      fetchImpl: (async (url: string) => {
        if (String(url).endsWith('manifest.sig')) return new Response('ff'.repeat(64));
        return jsonResponse({ ...validManifest, version: '9.9.9' });
      }) as typeof fetch,
    });
    expect(tampered.fetchManifest()).rejects.toThrow(/签名/);

    const missing = makeHub(new Response('not found', { status: 404 }));
    expect(missing.fetchManifest()).rejects.toThrow(/manifest\.sig/);
  });
});
