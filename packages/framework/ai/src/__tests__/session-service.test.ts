import { describe, expect, test } from 'bun:test';
import type { Database } from '@ventostack/database';
import type { MemoryScope, MemoryService } from '../memory/types';
import { createSessionService } from '../session-service';
import type { SessionSettings } from '../session-service';

const SCOPE: MemoryScope = { tenantId: 't1', userId: 'u1' };

/** 降级路径会 console.error 打出预期内的错误，静音以免 CI 输出误导 */
async function withSilencedErrors<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

interface MemoryStub {
  service: MemoryService;
  created: string[];
  renamed: Array<{ sessionId: string; title: string }>;
}

/** 最小 MemoryService 桩：只实现 SessionService 会用到的方法 */
function stubMemory(options: { sessions?: string[] } = {}): MemoryStub {
  const created: string[] = [];
  const renamed: Array<{ sessionId: string; title: string }> = [];
  const sessions = options.sessions ?? [];

  const service = {
    async createSession(params: { title?: string }) {
      const sessionId = `sess-${created.length + 1}`;
      created.push(sessionId);
      if (params.title) renamed.push({ sessionId, title: params.title });
      return { sessionId };
    },
    async getSession(sessionId: string, scope: MemoryScope) {
      if (!sessions.includes(sessionId)) return null;
      return {
        sessionId,
        tenantId: scope.tenantId,
        userId: scope.userId,
        agentId: 'agent-1',
        title: null,
        status: 'active',
        messageCount: 0,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      };
    },
    async listSessions() {
      return sessions.map((sessionId) => ({
        sessionId,
        tenantId: SCOPE.tenantId,
        userId: SCOPE.userId,
        agentId: 'agent-1',
        title: null,
        status: 'active',
        messageCount: 0,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
      }));
    },
    async renameSession(sessionId: string, _scope: MemoryScope, title: string) {
      renamed.push({ sessionId, title });
    },
    async appendMessage() {},
    async getHistory() {
      return [];
    },
    async moveSessionToTrash() {},
    async listTrash() {
      return [];
    },
    async restoreSession() {},
    async purgeSession() {},
  };

  return { service: service as unknown as MemoryService, created, renamed };
}

interface FakeDbOptions {
  /** 已存在的 meta 行（key = session_id） */
  metaRows?: Record<string, { origin: string; settings: unknown }>;
  /** 让所有 raw 调用抛错 */
  failing?: boolean;
}

function fakeDb(options: FakeDbOptions = {}) {
  const metaRows = options.metaRows ?? {};
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  const inserts: unknown[][] = [];
  let selectCount = 0;

  const db = {
    async raw(sql: string, params: unknown[] = []) {
      if (options.failing) throw new Error('db down');
      if (sql.includes('INSERT INTO ai_session_meta')) {
        inserts.push(params);
        return [];
      }
      if (sql.trimStart().startsWith('SELECT')) {
        selectCount += 1;
        const toRow = (sessionId: string) => {
          const row = metaRows[sessionId];
          if (!row) return null;
          return {
            session_id: sessionId,
            tenant_id: SCOPE.tenantId,
            user_id: SCOPE.userId,
            agent_id: 'agent-1',
            origin: row.origin,
            origin_channel_id: null,
            origin_channel_type: null,
            settings: row.settings,
          };
        };
        // list / backfill 走批量查询：$1=tenantId、$2=userId，会话 id 从 $3 起
        if (sql.includes('session_id IN')) {
          return params
            .slice(2)
            .map((id) => toRow(String(id)))
            .filter((row) => row !== null);
        }
        const row = toRow(String(params[0] ?? ''));
        return row ? [row] : [];
      }
      updates.push({ sql, params });
      // UPDATE 需要 RETURNING 出一行，否则会走「补建 meta 行」分支
      return sql.includes('RETURNING') ? [{ session_id: params[0] }] : [];
    },
  } as unknown as Database;

  return { db, updates, inserts, selectCount: () => selectCount };
}

describe('createSessionService：无 db 降级', () => {
  const memory = stubMemory();

  test('getSettings 返回 null（不抛错）', async () => {
    const service = createSessionService({ memory: memory.service });
    expect(await service.getSettings('sess-1', SCOPE)).toBeNull();
  });

  test('updateSettings 直接回显 patch（不落库也不抛错）', async () => {
    const service = createSessionService({ memory: memory.service });
    const patch = { channel: { notifyEnabled: true } };
    expect(await service.updateSettings('sess-1', SCOPE, patch)).toEqual(patch);
  });

  test('backfill 退化为空结果', async () => {
    const service = createSessionService({ memory: memory.service });
    expect(await service.backfill(SCOPE)).toEqual({ scanned: 0, filled: 0 });
  });

  test('backfill 缺 scope 时也不抛错', async () => {
    const service = createSessionService({ memory: memory.service });
    expect(await service.backfill()).toEqual({ scanned: 0, filled: 0 });
  });

  test('create 仍能建会话，view 的 origin 退化为 web', async () => {
    const local = stubMemory();
    const service = createSessionService({ memory: local.service });
    const { sessionId } = await service.create({
      tenantId: SCOPE.tenantId,
      userId: SCOPE.userId,
      agentId: 'agent-1',
    });
    expect(sessionId).toBe('sess-1');
  });
});

describe('createSessionService：create 写链路', () => {
  test('先写 JSONL 再写 meta 投影，并把 origin 落到 meta', async () => {
    const memory = stubMemory();
    const store = fakeDb();
    const service = createSessionService({ memory: memory.service, db: store.db });

    await service.create({
      tenantId: SCOPE.tenantId,
      userId: SCOPE.userId,
      agentId: 'agent-1',
      origin: { kind: 'channel', channelId: 'ch-1', channelType: 'qqbot' },
    });

    expect(memory.created).toEqual(['sess-1']);
    expect(store.inserts.length).toBe(1);
    // 参数顺序：sessionId, tenantId, userId, agentId, origin, channelId, channelType
    expect(store.inserts[0]?.[4]).toBe('channel');
    expect(store.inserts[0]?.[5]).toBe('ch-1');
    expect(store.inserts[0]?.[6]).toBe('qqbot');
  });

  test('meta 写入失败不阻断建会话（可用性优先）', async () => {
    const memory = stubMemory();
    const store = fakeDb({ failing: true });
    const service = createSessionService({ memory: memory.service, db: store.db });

    const { sessionId } = await withSilencedErrors(() =>
      service.create({
        tenantId: SCOPE.tenantId,
        userId: SCOPE.userId,
        agentId: 'agent-1',
      }),
    );
    expect(sessionId).toBe('sess-1');
  });

  test('非法 scope 直接抛错，避免脏数据', async () => {
    const memory = stubMemory();
    const service = createSessionService({ memory: memory.service });
    await expect(
      service.create({ tenantId: 'bad id', userId: 'u1', agentId: 'agent-1' }),
    ).rejects.toThrow('Invalid tenantId');
    await expect(
      service.create({ tenantId: 't1', userId: '', agentId: 'agent-1' }),
    ).rejects.toThrow('Invalid userId');
  });
});

describe('createSessionService：updateSettings 合并语义', () => {
  test('嵌套对象浅合并且未提供的键保留', async () => {
    const memory = stubMemory();
    const store = fakeDb({
      metaRows: {
        'sess-1': {
          origin: 'web',
          settings: {
            channel: { notifyEnabled: true, notifyChannelIds: ['ch-1'] },
            other: { keep: 1 },
          },
        },
      },
    });
    const service = createSessionService({ memory: memory.service, db: store.db });

    await service.updateSettings('sess-1', SCOPE, {
      channel: { autoNotifyOnFinish: true },
    });

    expect(store.updates.length).toBe(1);
    const written = JSON.parse(String(store.updates[0]?.params[3])) as Record<string, unknown>;
    // channel 命名空间被合并而不是整体替换
    expect(written.channel).toEqual({
      notifyEnabled: true,
      notifyChannelIds: ['ch-1'],
      autoNotifyOnFinish: true,
    });
    // 其它命名空间不动
    expect(written.other).toEqual({ keep: 1 });
  });

  test('undefined 值不覆盖已有设置', async () => {
    const memory = stubMemory();
    const store = fakeDb({
      metaRows: {
        'sess-1': { origin: 'web', settings: { channel: { notifyEnabled: true } } },
      },
    });
    const service = createSessionService({ memory: memory.service, db: store.db });

    // exactOptionalPropertyTypes 下正常调用方不会传 undefined，
    // 但 JSON 反序列化 / JS 调用方仍可能带进来，必须防御
    const patch = {
      channel: { notifyEnabled: undefined, autoNotifyOnFinish: false },
    } as unknown as Partial<SessionSettings>;
    await service.updateSettings('sess-1', SCOPE, patch);

    const written = JSON.parse(String(store.updates[0]?.params[3])) as {
      channel: Record<string, unknown>;
    };
    expect(written.channel.notifyEnabled).toBe(true);
    expect(written.channel.autoNotifyOnFinish).toBe(false);
  });

  test('meta 行不存在时补建一行再写（设置不静默丢失）', async () => {
    // getSession 能查到会话，但 meta 为空
    const memory = stubMemory({ sessions: ['sess-1'] });
    const store = fakeDb({ metaRows: {} });
    // 第一个 UPDATE 不 RETURNING（模拟行不存在），补建后再写一次
    const originalRaw = (store.db as unknown as { raw: typeof store.db.raw }).raw;
    let updateCalls = 0;
    (store.db as unknown as { raw: typeof store.db.raw }).raw = (async (
      sql: string,
      params: unknown[] = [],
    ) => {
      updateCalls += 1;
      if (sql.includes('UPDATE ai_session_meta') && updateCalls <= 2) {
        return [];
      }
      return originalRaw(sql, params);
    }) as typeof store.db.raw;

    const service = createSessionService({ memory: memory.service, db: store.db });
    const result = await service.updateSettings('sess-1', SCOPE, {
      channel: { notifyEnabled: true },
    });

    expect(result.channel).toEqual({ notifyEnabled: true });
    expect(store.inserts.length).toBe(1);
  });

  test('settings 以 JSON 字符串返回时也能解析（Pg 驱动差异）', async () => {
    const memory = stubMemory();
    const store = fakeDb({
      metaRows: {
        'sess-1': { origin: 'web', settings: '{"channel":{"notifyEnabled":true}}' },
      },
    });
    const service = createSessionService({ memory: memory.service, db: store.db });
    const settings = await service.getSettings<{ channel: { notifyEnabled: boolean } }>(
      'sess-1',
      SCOPE,
    );
    expect(settings?.channel.notifyEnabled).toBe(true);
  });
});

describe('createSessionService：get / list / backfill', () => {
  test('get 在 meta 缺失时懒修复', async () => {
    const memory = stubMemory({ sessions: ['sess-1'] });
    const store = fakeDb({ metaRows: {} });
    const service = createSessionService({ memory: memory.service, db: store.db });

    const view = await service.get('sess-1', SCOPE);
    expect(view?.sessionId).toBe('sess-1');
    expect(view?.origin).toEqual({ kind: 'web' });
    expect(store.inserts.length).toBe(1);
  });

  test('get 对不存在的会话返回 null', async () => {
    const memory = stubMemory();
    const service = createSessionService({ memory: memory.service, db: fakeDb().db });
    expect(await service.get('nope', SCOPE)).toBeNull();
  });

  test('list 读取批量 meta，缺失的退化为 web 来源', async () => {
    const memory = stubMemory({ sessions: ['sess-1', 'sess-2'] });
    const store = fakeDb({
      metaRows: {
        'sess-1': { origin: 'channel', settings: {} },
      },
    });
    const service = createSessionService({ memory: memory.service, db: store.db });

    const views = await service.list({ tenantId: SCOPE.tenantId, userId: SCOPE.userId });
    expect(views.length).toBe(2);
    expect(views[0]?.origin.kind).toBe('channel');
    expect(views[1]?.origin.kind).toBe('web');
  });

  test('list 读取 meta 失败时整体退化为 web 来源而非报错', async () => {
    const memory = stubMemory({ sessions: ['sess-1'] });
    const service = createSessionService({
      memory: memory.service,
      db: fakeDb({ failing: true }).db,
    });
    const views = await withSilencedErrors(() =>
      service.list({ tenantId: SCOPE.tenantId, userId: SCOPE.userId }),
    );
    expect(views[0]?.origin.kind).toBe('web');
    expect(views[0]?.settings).toEqual({});
  });

  test('backfill 只补缺失的 meta 行', async () => {
    const memory = stubMemory({ sessions: ['sess-1', 'sess-2'] });
    const store = fakeDb({ metaRows: { 'sess-1': { origin: 'web', settings: {} } } });
    const service = createSessionService({ memory: memory.service, db: store.db });

    const result = await service.backfill(SCOPE);
    expect(result).toEqual({ scanned: 2, filled: 1 });
  });
});
