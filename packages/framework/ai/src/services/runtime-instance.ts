import type { Database } from '@ventostack/database';
import type { RuntimeSettings } from '../agent-runtime/settings';
import type { RuntimeResources, RuntimeSandbox } from '../agent-runtime/types';
import type { AgentRuntimeClient } from '../agent-runtime/types';
import type { RuntimeCapacityService } from './runtime-capacity';
import type { RuntimeClientRegistry } from './runtime-client-registry';
import type { RuntimeHostItem, RuntimeHostService } from './runtime-host';
import type { WorkspaceBackupService } from './runtime-workspace-backup';

export type RuntimeInstanceState =
  | 'provisioning'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'failed'
  | 'lost'
  | 'destroyed';

export interface RuntimeInstance {
  id: string;
  tenantId: string;
  userId: string;
  agentId: string;
  hostId: string;
  sandboxId: string | null;
  state: RuntimeInstanceState;
  resources: RuntimeResources;
  networkEnabled: boolean;
  lastActiveAt: string | null;
  lastCheckedAt: string | null;
  expiresAt: string | null;
  lastGlobalMemorySyncAt: string | null;
  lastWorkspaceSyncAt: string | null;
  idleNotifiedAt: string | null;
  staleNotifiedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnsuredRuntime {
  instance: RuntimeInstance;
  client: AgentRuntimeClient;
  recreated: boolean;
}

export interface RuntimeInstanceService {
  ensure(params: {
    tenantId: string;
    userId: string;
    agentId: string;
    resources?: RuntimeResources;
    networkEnabled?: boolean;
  }): Promise<EnsuredRuntime>;
  get(tenantId: string, userId: string, agentId: string): Promise<RuntimeInstance | null>;
  getById(id: string): Promise<RuntimeInstance | null>;
  listByUser(tenantId: string, userId: string): Promise<RuntimeInstance[]>;
  listByHost(hostId: string): Promise<RuntimeInstance[]>;
  listAll(): Promise<RuntimeInstance[]>;
  destroy(params: {
    tenantId: string;
    userId: string;
    agentId: string;
    backup?: boolean;
  }): Promise<void>;
  destroyByAgent(tenantId: string, agentId: string): Promise<number>;
  destroyByHost(hostId: string): Promise<number>;
  reconcileHost(hostId: string, sandboxes: RuntimeSandbox[]): Promise<{
    updated: number;
    lost: number;
    orphans: string[];
  }>;
  markIdleNotified(id: string): Promise<void>;
  markStaleNotified(id: string): Promise<void>;
  markError(id: string, message: string): Promise<void>;
}

interface InstanceRow {
  id: string;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  host_id: string;
  sandbox_id: string | null;
  state: string;
  cpu_count: number;
  memory_mb: number;
  disk_mb: number;
  max_processes: number;
  network_enabled: boolean;
  last_active_at: Date | string | null;
  last_checked_at: Date | string | null;
  expires_at: Date | string | null;
  last_global_memory_sync_at: Date | string | null;
  last_workspace_sync_at: Date | string | null;
  idle_notified_at: Date | string | null;
  stale_notified_at: Date | string | null;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapInstance(row: InstanceRow): RuntimeInstance {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    agentId: row.agent_id,
    hostId: row.host_id,
    sandboxId: row.sandbox_id,
    state: row.state as RuntimeInstanceState,
    resources: {
      cpuCount: asNumber(row.cpu_count, 2),
      memoryMb: asNumber(row.memory_mb, 4096),
      diskMb: asNumber(row.disk_mb, 8192),
      maxProcesses: asNumber(row.max_processes, 512),
    },
    networkEnabled: row.network_enabled !== false,
    lastActiveAt: iso(row.last_active_at),
    lastCheckedAt: iso(row.last_checked_at),
    expiresAt: iso(row.expires_at),
    lastGlobalMemorySyncAt: iso(row.last_global_memory_sync_at),
    lastWorkspaceSyncAt: iso(row.last_workspace_sync_at),
    idleNotifiedAt: iso(row.idle_notified_at),
    staleNotifiedAt: iso(row.stale_notified_at),
    error: row.error,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
  };
}

function instanceError(code: string, message: string, status = 503): Error {
  return Object.assign(new Error(message), { code, status });
}

async function markErrorRow(db: Database, id: string, message: string): Promise<void> {
  await db
    .raw(
      'UPDATE ai_agent_runtime SET error = $2, updated_at = NOW() WHERE id = $1',
      [id, message],
    )
    .catch(() => undefined);
}

function stateFromSandbox(state: string): RuntimeInstanceState {
  switch (state) {
    case 'RUNNING':
      return 'running';
    case 'PAUSED':
      return 'paused';
    case 'STOPPED':
      return 'stopped';
    case 'FAILED':
      return 'failed';
    case 'DESTROYED':
      return 'destroyed';
    default:
      return 'provisioning';
  }
}

export function createRuntimeInstanceService(deps: {
  db: Database;
  settings: RuntimeSettings;
  hostService: RuntimeHostService;
  capacity: RuntimeCapacityService;
  clients: RuntimeClientRegistry;
  workspaceBackup: WorkspaceBackupService;
}): RuntimeInstanceService {
  const { db, settings, hostService, capacity, clients, workspaceBackup } = deps;
  const locks = new Map<string, Promise<unknown>>();

  async function getRowById(id: string): Promise<InstanceRow | null> {
    const rows = (await db.raw('SELECT * FROM ai_agent_runtime WHERE id = $1', [id])) as InstanceRow[];
    return rows[0] ?? null;
  }

  async function getRow(
    tenantId: string,
    userId: string,
    agentId: string,
  ): Promise<InstanceRow | null> {
    const rows = (await db.raw(
      `SELECT * FROM ai_agent_runtime
       WHERE tenant_id = $1 AND user_id = $2 AND agent_id = $3`,
      [tenantId, userId, agentId],
    )) as InstanceRow[];
    return rows[0] ?? null;
  }

  async function updateRow(
    id: string,
    sets: string[],
    values: unknown[],
  ): Promise<void> {
    if (sets.length === 0) return;
    await db.raw(
      `UPDATE ai_agent_runtime SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`,
      [id, ...values],
    );
  }

  async function markRunning(id: string, sandbox: RuntimeSandbox): Promise<void> {
    await updateRow(
      id,
      [
        'sandbox_id = $2',
        'state = $3',
        'last_active_at = NOW()',
        'last_checked_at = NOW()',
        'expires_at = $4',
        'error = NULL',
      ],
      [
        sandbox.sandboxId,
        stateFromSandbox(sandbox.state),
        sandbox.expiresAtMs ? new Date(sandbox.expiresAtMs) : null,
      ],
    );
  }

  async function restoreWorkspace(
    instance: RuntimeInstance,
    client: AgentRuntimeClient,
  ): Promise<void> {
    if (!instance.sandboxId) return;
    try {
      await workspaceBackup.restore(
        {
          id: instance.id,
          tenantId: instance.tenantId,
          userId: instance.userId,
          agentId: instance.agentId,
          sandboxId: instance.sandboxId,
        },
        client,
      );
    } catch (error) {
      await markErrorRow(db, instance.id,
        `工作区恢复失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function createSandboxForRow(
    row: InstanceRow,
    host: RuntimeHostItem,
    recreated: boolean,
  ): Promise<EnsuredRuntime> {
    const client = await clients.get(host.id);
    const resources: RuntimeResources = {
      cpuCount: asNumber(row.cpu_count, settings.defaultResources.cpuCount),
      memoryMb: asNumber(row.memory_mb, settings.defaultResources.memoryMb),
      diskMb: asNumber(row.disk_mb, settings.defaultResources.diskMb),
      maxProcesses: asNumber(row.max_processes, settings.defaultResources.maxProcesses),
    };
    try {
      const sandbox = await client.createSandbox({
        sessionId: row.id,
        resources,
        timeoutSeconds: 86_400,
        idleAction: 'pause',
        networkEnabled: row.network_enabled !== false,
      });
      await markRunning(row.id, sandbox);
      const updated = await getRowById(row.id);
      if (!updated) throw instanceError('RUNTIME_INSTANCE_NOT_FOUND', '实例记录丢失', 500);
      const instance = mapInstance(updated);
      await restoreWorkspace(instance, client);
      return { instance, client, recreated };
    } catch (error) {
      await updateRow(row.id, ['state = $2', 'error = $3'], [
        'failed',
        error instanceof Error ? error.message : String(error),
      ]).catch(() => undefined);
      throw instanceError(
        'RUNTIME_PROVISION_FAILED',
        `创建虚拟机失败：${error instanceof Error ? error.message : String(error)}`,
        503,
      );
    }
  }

  async function ensureExisting(row: InstanceRow): Promise<EnsuredRuntime> {
    const host = await hostService.getById(row.host_id);
    if (!host || !host.enabled) {
      throw instanceError('RUNTIME_HOST_DISABLED', '虚拟机宿主已停用', 503);
    }
    if (host.status !== 'online') {
      throw instanceError(
        'RUNTIME_HOST_OFFLINE',
        '虚拟机宿主当前离线，请稍后重试或联系平台管理员',
        503,
      );
    }
    if (!row.sandbox_id || row.state === 'destroyed' || row.state === 'failed' || row.state === 'lost') {
      if (row.sandbox_id) {
        // 旧实例可能仍存在：重建前尽量销毁，避免宿主上留下孤儿。
        try {
          const oldClient = await clients.get(row.host_id);
          await oldClient.destroySandbox(row.sandbox_id).catch(() => undefined);
        } catch {
          // 宿主不可达时由监控对账清理
        }
      }
      await updateRow(row.id, ['state = $2', 'host_id = $3', 'sandbox_id = NULL', 'error = NULL'], [
        'provisioning',
        host.id,
      ]);
      const latest = await getRowById(row.id);
      return createSandboxForRow(latest ?? row, host, true);
    }
    const client = await clients.get(host.id);
    let sandbox: RuntimeSandbox;
    try {
      sandbox = await client.getSandbox(row.sandbox_id);
    } catch {
      await updateRow(row.id, ['state = $2', 'error = $3'], [
        'lost',
        '虚拟机实例已不存在，将重新创建',
      ]);
      const latest = await getRowById(row.id);
      return createSandboxForRow(latest ?? row, host, true);
    }
    if (sandbox.state === 'PAUSED') {
      sandbox = await client.resumeSandbox(row.sandbox_id);
    } else if (sandbox.state === 'STOPPED') {
      sandbox = await client.startSandbox(row.sandbox_id);
    } else if (sandbox.state === 'FAILED' || sandbox.state === 'DESTROYED') {
      await updateRow(row.id, ['state = $2', 'error = $3'], [
        'failed',
        '虚拟机进入失败状态，将重新创建',
      ]);
      const latest = await getRowById(row.id);
      return createSandboxForRow(latest ?? row, host, true);
    }
    await markRunning(row.id, sandbox);
    const updated = await getRowById(row.id);
    if (!updated) throw instanceError('RUNTIME_INSTANCE_NOT_FOUND', '实例记录丢失', 500);
    return { instance: mapInstance(updated), client, recreated: false };
  }

  async function ensureUnlocked(params: {
    tenantId: string;
    userId: string;
    agentId: string;
    resources?: RuntimeResources;
  }): Promise<EnsuredRuntime> {
    const existing = await getRow(params.tenantId, params.userId, params.agentId);
    if (existing) return ensureExisting(existing);

    const resources = params.resources ?? settings.defaultResources;
    const host = await capacity.selectHost(params.tenantId, params.userId, resources);
    const id = crypto.randomUUID();
    const inserted = (await db.raw(
      `INSERT INTO ai_agent_runtime
        (id, tenant_id, agent_id, user_id, host_id, state, cpu_count, memory_mb, disk_mb, max_processes, network_enabled)
       VALUES ($1,$2,$3,$4,$5,'provisioning',$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, user_id, agent_id) DO NOTHING
       RETURNING *`,
      [
        id,
        params.tenantId,
        params.agentId,
        params.userId,
        host.id,
        resources.cpuCount,
        resources.memoryMb,
        resources.diskMb,
        resources.maxProcesses,
        params.networkEnabled ?? true,
      ],
    )) as InstanceRow[];
    if (inserted[0]) {
      return createSandboxForRow(inserted[0], host, false);
    }
    const raced = await getRow(params.tenantId, params.userId, params.agentId);
    if (!raced) throw instanceError('RUNTIME_INSTANCE_CREATE_FAILED', '实例创建失败', 500);
    return ensureExisting(raced);
  }

  async function ensure(
    params: {
      tenantId: string;
      userId: string;
      agentId: string;
      resources?: RuntimeResources;
    },
  ): Promise<EnsuredRuntime> {
    const key = `${params.tenantId}:${params.userId}:${params.agentId}`;
    const previous = locks.get(key);
    if (previous) return previous as Promise<EnsuredRuntime>;
    const task = ensureUnlocked(params).finally(() => {
      locks.delete(key);
    });
    locks.set(key, task as Promise<unknown>);
    return task;
  }

  async function destroy(params: {
    tenantId: string;
    userId: string;
    agentId: string;
    backup?: boolean;
  }): Promise<void> {
    const row = await getRow(params.tenantId, params.userId, params.agentId);
    if (!row) return;
    const instance = mapInstance(row);
    if (row.sandbox_id) {
      const host = await hostService.getById(row.host_id);
      if (host?.status === 'online') {
        try {
          const client = await clients.get(row.host_id);
          if (params.backup !== false) {
            try {
              await workspaceBackup.syncInstance(
                {
                  id: instance.id,
                  tenantId: instance.tenantId,
                  userId: instance.userId,
                  agentId: instance.agentId,
                  sandboxId: row.sandbox_id,
                },
                client,
              );
            } catch (error) {
              console.error('[ai] 释放前工作区备份失败:', error);
            }
          }
          await client.destroySandbox(row.sandbox_id).catch(() => undefined);
        } catch (error) {
          console.error('[ai] 释放虚拟机失败:', error);
        }
      }
    }
    await updateRow(row.id, [
      'state = $2',
      'sandbox_id = NULL',
      'last_active_at = NOW()',
      'error = NULL',
    ], ['destroyed']);
  }

  async function pause(id: string): Promise<void> {
    const row = await getRowById(id);
    if (!row) throw instanceError('RUNTIME_INSTANCE_NOT_FOUND', '实例不存在', 404);
    if (!row.sandbox_id) throw instanceError('RUNTIME_INSTANCE_NOT_READY', '实例尚未创建', 409);
    const client = await clients.get(row.host_id);
    await client.pauseSandbox(row.sandbox_id);
    await updateRow(id, ['state = $2'], ['paused']);
  }

  async function resume(id: string): Promise<void> {
    const row = await getRowById(id);
    if (!row) throw instanceError('RUNTIME_INSTANCE_NOT_FOUND', '实例不存在', 404);
    if (!row.sandbox_id) throw instanceError('RUNTIME_INSTANCE_NOT_READY', '实例尚未创建', 409);
    const client = await clients.get(row.host_id);
    await client.resumeSandbox(row.sandbox_id);
    await updateRow(id, ['state = $2', 'last_active_at = NOW()'], ['running']);
  }

  async function destroyByAgent(tenantId: string, agentId: string): Promise<number> {
    const rows = (await db.raw(
      'SELECT * FROM ai_agent_runtime WHERE tenant_id = $1 AND agent_id = $2',
      [tenantId, agentId],
    )) as InstanceRow[];
    for (const row of rows) {
      await destroy({
        tenantId: row.tenant_id,
        userId: row.user_id,
        agentId: row.agent_id,
      });
    }
    return rows.length;
  }

  async function destroyByHost(hostId: string): Promise<number> {
    const rows = (await db.raw('SELECT * FROM ai_agent_runtime WHERE host_id = $1', [
      hostId,
    ])) as InstanceRow[];
    for (const row of rows) {
      await destroy({
        tenantId: row.tenant_id,
        userId: row.user_id,
        agentId: row.agent_id,
      });
    }
    // host_id 是 RESTRICT 外键：强制删除宿主前必须移除实例行，否则宿主删除会被数据库拒绝。
    // 工作区备份在磁盘上保留，后续重建时仍可按用户/Agent 路径恢复。
    await db.raw(
      `DELETE FROM ai_runtime_session_kb_file
       WHERE session_id IN (
         SELECT session_id FROM ai_session_runtime
         WHERE instance_id IN (SELECT id FROM ai_agent_runtime WHERE host_id = $1)
       )`,
      [hostId],
    );
    await db.raw('DELETE FROM ai_agent_runtime WHERE host_id = $1', [hostId]);
    return rows.length;
  }

  async function reconcileHost(
    hostId: string,
    sandboxes: RuntimeSandbox[],
  ): Promise<{ updated: number; lost: number; orphans: string[] }> {
    const rows = (await db.raw('SELECT * FROM ai_agent_runtime WHERE host_id = $1', [
      hostId,
    ])) as InstanceRow[];
    const bySandbox = new Map(sandboxes.map((sandbox) => [sandbox.sandboxId, sandbox]));
    const known = new Set(rows.map((row) => row.sandbox_id).filter(Boolean) as string[]);
    let updated = 0;
    let lost = 0;
    for (const row of rows) {
      if (!row.sandbox_id) continue;
      const sandbox = bySandbox.get(row.sandbox_id);
      if (!sandbox) {
        await updateRow(row.id, ['state = $2', 'last_checked_at = NOW()'], ['lost']);
        lost += 1;
        continue;
      }
      const next = stateFromSandbox(sandbox.state);
      if (next !== row.state) {
        await updateRow(row.id, ['state = $2', 'last_checked_at = NOW()'], [next]);
        updated += 1;
      } else {
        await updateRow(row.id, ['last_checked_at = NOW()'], []);
      }
    }
    const orphans = sandboxes
      .map((sandbox) => sandbox.sandboxId)
      .filter((id) => !known.has(id));
    return { updated, lost, orphans };
  }

  return {
    ensure,
    async get(tenantId, userId, agentId): Promise<RuntimeInstance | null> {
      const row = await getRow(tenantId, userId, agentId);
      return row ? mapInstance(row) : null;
    },
    async getById(id): Promise<RuntimeInstance | null> {
      const row = await getRowById(id);
      return row ? mapInstance(row) : null;
    },
    async listByUser(tenantId, userId): Promise<RuntimeInstance[]> {
      const rows = (await db.raw(
        'SELECT * FROM ai_agent_runtime WHERE tenant_id = $1 AND user_id = $2 ORDER BY created_at DESC',
        [tenantId, userId],
      )) as InstanceRow[];
      return rows.map(mapInstance);
    },
    pause,
    resume,
    async listByHost(hostId): Promise<RuntimeInstance[]> {
      const rows = (await db.raw(
        'SELECT * FROM ai_agent_runtime WHERE host_id = $1 ORDER BY created_at DESC',
        [hostId],
      )) as InstanceRow[];
      return rows.map(mapInstance);
    },
    async listAll(): Promise<RuntimeInstance[]> {
      const rows = (await db.raw(
        'SELECT * FROM ai_agent_runtime ORDER BY created_at DESC',
      )) as InstanceRow[];
      return rows.map(mapInstance);
    },
    destroy,
    destroyByAgent,
    destroyByHost,
    reconcileHost,
    async markIdleNotified(id): Promise<void> {
      await db.raw(
        'UPDATE ai_agent_runtime SET idle_notified_at = NOW(), updated_at = NOW() WHERE id = $1',
        [id],
      );
    },
    async markStaleNotified(id): Promise<void> {
      await db.raw(
        'UPDATE ai_agent_runtime SET stale_notified_at = NOW(), updated_at = NOW() WHERE id = $1',
        [id],
      );
    },
    async markError(id, message): Promise<void> {
      await updateRow(id, ['error = $2'], [message]).catch(() => undefined);
    },
  };
}
