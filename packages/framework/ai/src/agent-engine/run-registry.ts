/**
 * 会话运行租约（RunRegistry）
 *
 * 同一个会话同一时刻只能有一个 Agent run 写历史（JSONL 是一棵树，并发写会交错）。
 * 现有 Web 对话在路由闭包里用 `activeRuns: Map<sessionId, AbortController>` 做进程内互斥；
 * 后台任务触发是**另一个入口**（不在请求生命周期内），必须与 Web 共用同一把锁，否则
 * 后台唤醒会和用户正在进行的对话互相踩。多实例部署还需要跨进程可见，因此：
 *
 *   - 进程内：Map<sessionId, {token, controller, kind}>，用于同实例 abort（停止按钮/新消息抢占）；
 *   - 跨进程：ai_session_run 表 + 租约（token + expires_at + 心跳续约）。
 *
 * 两种抢占语义：
 *   - begin()：Web 对话语义——新消息抢占旧运行（同实例 abort 旧 controller，DB 租约无条件接管）；
 *   - tryBegin()：后台触发语义——会话正忙就返回 null（本轮跳过，由调用方安排下次触发）。
 */
import type { Database } from '@ventostack/database';

export type RunKind = 'web' | 'channel' | 'background' | 'system';

export interface RunScope {
  tenantId: string;
  userId: string;
}

export interface RunHandle {
  sessionId: string;
  token: string;
  kind: RunKind;
  /** 运行级取消信号（不是 HTTP 请求信号） */
  controller: AbortController;
  startedAt: number;
  release(): Promise<void>;
}

export interface BeginRunParams extends RunScope {
  sessionId: string;
  kind: RunKind;
}

export interface RunRegistry {
  /** 抢占式开始（Web 对话 / 渠道）：中止同实例旧运行并接管会话租约 */
  begin(params: BeginRunParams): Promise<RunHandle>;
  /** 仅当会话空闲时开始（后台触发）：忙则返回 null */
  tryBegin(params: BeginRunParams): Promise<RunHandle | null>;
  /** 中止会话运行（停止按钮）；scope 存在时校验归属 */
  abort(sessionId: string, scope?: RunScope): boolean;
  /** 查询当前会话运行状态（进程内可见；跨实例返回 null） */
  get(
    sessionId: string,
  ): { kind: RunKind; startedAt: number; tenantId: string; userId: string } | null;
  /** 关停：中止所有本实例运行 */
  shutdown(): void;
}

export interface RunRegistryDeps {
  db?: Database;
  /** 实例标识（多实例租约归属） */
  instanceId: string;
  /** 租约时长（毫秒），默认 5 分钟 */
  leaseTtlMs?: number;
}

interface ActiveRun {
  token: string;
  kind: RunKind;
  tenantId: string;
  userId: string;
  controller: AbortController;
  startedAt: number;
  heartbeat: ReturnType<typeof setInterval> | undefined;
}

const DEFAULT_LEASE_TTL_MS = 300_000;

export function createRunRegistry(deps: RunRegistryDeps): RunRegistry {
  const { db, instanceId } = deps;
  const ttlMs = deps.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
  const active = new Map<string, ActiveRun>();

  function clearHeartbeat(run: ActiveRun): void {
    if (run.heartbeat) clearInterval(run.heartbeat);
    run.heartbeat = undefined;
  }

  async function renewLease(sessionId: string, token: string): Promise<void> {
    if (!db) return;
    try {
      await db.raw(
        `UPDATE ai_session_run
            SET expires_at = NOW() + ($3::text || ' milliseconds')::interval,
                updated_at = NOW()
          WHERE session_id = $1 AND token = $2`,
        [sessionId, token, ttlMs],
      );
    } catch (error) {
      console.warn('[ai] 会话运行租约续约失败:', error);
    }
  }

  function track(sessionId: string, run: ActiveRun): RunHandle {
    run.heartbeat = setInterval(
      () => {
        void renewLease(sessionId, run.token);
      },
      Math.max(Math.floor(ttlMs / 3), 10_000),
    );
    (run.heartbeat as unknown as { unref?: () => void }).unref?.();
    active.set(sessionId, run);
    let released = false;
    return {
      sessionId,
      token: run.token,
      kind: run.kind,
      controller: run.controller,
      startedAt: run.startedAt,
      async release(): Promise<void> {
        if (released) return;
        released = true;
        clearHeartbeat(run);
        if (active.get(sessionId)?.token === run.token) active.delete(sessionId);
        if (!db) return;
        try {
          await db.raw('DELETE FROM ai_session_run WHERE session_id = $1 AND token = $2', [
            sessionId,
            run.token,
          ]);
        } catch (error) {
          console.warn('[ai] 会话运行租约释放失败:', error);
        }
      },
    };
  }

  /**
   * 清理本会话已过期的 DB 租约（崩溃实例残留）。
   * 用 DELETE 而非等待覆盖：避免 tryBegin 的 INSERT 被主键挡住。
   */
  async function dropExpiredLease(sessionId: string): Promise<void> {
    if (!db) return;
    try {
      await db.raw('DELETE FROM ai_session_run WHERE session_id = $1 AND expires_at < NOW()', [
        sessionId,
      ]);
    } catch (error) {
      console.warn('[ai] 清理过期会话租约失败:', error);
    }
  }

  async function begin(params: BeginRunParams): Promise<RunHandle> {
    const existing = active.get(params.sessionId);
    if (existing) {
      existing.controller.abort();
      clearHeartbeat(existing);
      active.delete(params.sessionId);
    }
    const token = crypto.randomUUID();
    if (db) {
      // 抢占式接管：不看过期时间，最后写入者获胜（与「新消息抢占旧运行」语义一致）
      try {
        await db.raw(
          `INSERT INTO ai_session_run
             (session_id, token, kind, tenant_id, user_id, owner_instance, started_at, expires_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW() + ($8::text || ' milliseconds')::interval,NOW())
           ON CONFLICT (session_id) DO UPDATE SET
             token = EXCLUDED.token,
             kind = EXCLUDED.kind,
             tenant_id = EXCLUDED.tenant_id,
             user_id = EXCLUDED.user_id,
             owner_instance = EXCLUDED.owner_instance,
             started_at = EXCLUDED.started_at,
             expires_at = EXCLUDED.expires_at,
             updated_at = NOW()`,
          [
            params.sessionId,
            token,
            params.kind,
            params.tenantId,
            params.userId,
            instanceId,
            ttlMs,
            ttlMs,
          ],
        );
      } catch (error) {
        console.warn('[ai] 会话运行租约写入失败（仅进程内互斥生效）:', error);
      }
    }
    return track(params.sessionId, {
      token,
      kind: params.kind,
      tenantId: params.tenantId,
      userId: params.userId,
      controller: new AbortController(),
      startedAt: Date.now(),
      heartbeat: undefined,
    });
  }

  async function tryBegin(params: BeginRunParams): Promise<RunHandle | null> {
    if (active.has(params.sessionId)) return null;
    if (!db) {
      return track(params.sessionId, {
        token: crypto.randomUUID(),
        kind: params.kind,
        tenantId: params.tenantId,
        userId: params.userId,
        controller: new AbortController(),
        startedAt: Date.now(),
        heartbeat: undefined,
      });
    }
    await dropExpiredLease(params.sessionId);
    const token = crypto.randomUUID();
    const rows = (await db.raw(
      `INSERT INTO ai_session_run
         (session_id, token, kind, tenant_id, user_id, owner_instance, started_at, expires_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW() + ($7::text || ' milliseconds')::interval,NOW())
       ON CONFLICT (session_id) DO NOTHING
       RETURNING session_id`,
      [params.sessionId, token, params.kind, params.tenantId, params.userId, instanceId, ttlMs],
    )) as Array<{ session_id: string }>;
    if (rows.length === 0) return null;
    return track(params.sessionId, {
      token,
      kind: params.kind,
      tenantId: params.tenantId,
      userId: params.userId,
      controller: new AbortController(),
      startedAt: Date.now(),
      heartbeat: undefined,
    });
  }

  function abort(sessionId: string, scope?: RunScope): boolean {
    const run = active.get(sessionId);
    if (!run) return false;
    if (scope && (run.tenantId !== scope.tenantId || run.userId !== scope.userId)) return false;
    run.controller.abort();
    return true;
  }

  function get(sessionId: string) {
    const run = active.get(sessionId);
    if (!run) return null;
    return {
      kind: run.kind,
      startedAt: run.startedAt,
      tenantId: run.tenantId,
      userId: run.userId,
    };
  }

  function shutdown(): void {
    for (const [sessionId, run] of active) {
      run.controller.abort();
      clearHeartbeat(run);
      active.delete(sessionId);
    }
  }

  return { begin, tryBegin, abort, get, shutdown };
}
