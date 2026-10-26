import { describe, expect, test } from 'bun:test';
import { createRunRegistry } from '../../agent-engine/run-registry';
import { createMockDatabase } from '../helpers';

const scope = { tenantId: 't1', userId: 'u1' };

describe('RunRegistry（进程内）', () => {
  test('begin 抢占：同会话新运行会中止旧运行的 controller', async () => {
    const registry = createRunRegistry({ instanceId: 'inst-1' });
    const first = await registry.begin({ ...scope, sessionId: 's1', kind: 'web' });
    const second = await registry.begin({ ...scope, sessionId: 's1', kind: 'web' });
    expect(first.controller.signal.aborted).toBe(true);
    expect(second.controller.signal.aborted).toBe(false);
    expect(registry.get('s1')?.kind).toBe('web');
    await first.release();
    await second.release();
  });

  test('tryBegin：会话忙时返回 null（后台触发不打断在线对话）', async () => {
    const registry = createRunRegistry({ instanceId: 'inst-1' });
    const web = await registry.begin({ ...scope, sessionId: 's1', kind: 'web' });
    expect(await registry.tryBegin({ ...scope, sessionId: 's1', kind: 'background' })).toBeNull();
    await web.release();
    const background = await registry.tryBegin({ ...scope, sessionId: 's1', kind: 'background' });
    expect(background).not.toBeNull();
    await background!.release();
  });

  test('abort 校验会话归属，不泄露他人运行', async () => {
    const registry = createRunRegistry({ instanceId: 'inst-1' });
    const run = await registry.begin({ ...scope, sessionId: 's1', kind: 'web' });
    expect(registry.abort('s1', { tenantId: 't-other', userId: 'u1' })).toBe(false);
    expect(registry.abort('s1', { tenantId: 't1', userId: 'u-other' })).toBe(false);
    expect(registry.abort('s1', scope)).toBe(true);
    await run.release();
  });

  test('release 后会话可再次被后台触发', async () => {
    const registry = createRunRegistry({ instanceId: 'inst-1' });
    const first = await registry.tryBegin({ ...scope, sessionId: 's1', kind: 'background' });
    expect(first).not.toBeNull();
    await first!.release();
    expect(await registry.tryBegin({ ...scope, sessionId: 's1', kind: 'background' })).not.toBeNull();
  });

  test('shutdown 中止所有本实例运行', async () => {
    const registry = createRunRegistry({ instanceId: 'inst-1' });
    const run = await registry.begin({ ...scope, sessionId: 's1', kind: 'web' });
    registry.shutdown();
    expect(run.controller.signal.aborted).toBe(true);
    expect(registry.get('s1')).toBeNull();
  });
});

describe('RunRegistry（DB 租约）', () => {
  test('tryBegin 遇到未过期租约返回 null', async () => {
    const { db, exec } = createMockDatabase({ 'INSERT INTO ai_session_run': [] });
    const registry = createRunRegistry({ db, instanceId: 'inst-1' });
    const handle = await registry.tryBegin({ ...scope, sessionId: 's1', kind: 'background' });
    expect(handle).toBeNull();
    // 先清理过期租约，再尝试插入（ON CONFLICT DO NOTHING）
    expect(String(exec.calls[0]?.[0])).toContain('DELETE FROM ai_session_run');
    expect(String(exec.calls[1]?.[0])).toContain('ON CONFLICT (session_id) DO NOTHING');
    expect(exec.calls[1]?.[1]).toContain('inst-1');
  });

  test('begin 无 DB 也可用；有 DB 时写入租约 token', async () => {
    const { db, exec } = createMockDatabase();
    const registry = createRunRegistry({ db, instanceId: 'inst-1' });
    const handle = await registry.begin({ ...scope, sessionId: 's1', kind: 'web' });
    const sql = String(exec.calls[0]?.[0]);
    expect(sql).toContain('ON CONFLICT (session_id) DO UPDATE');
    expect(exec.calls[0]?.[1]).toContain(handle.token);
    await handle.release();
    expect(String(exec.calls[1]?.[0])).toContain('DELETE FROM ai_session_run');
    expect(exec.calls[1]?.[1]).toEqual(['s1', handle.token]);
  });
});
