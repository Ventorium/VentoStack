import { randomBytes } from 'node:crypto';
import { VentoStackError } from '@ventostack/core';
import type { ConfigEncryptor } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { probeRuntimeHost, validateRuntimeBaseUrl } from '../agent-runtime/probe';
import type { RuntimeSettings } from '../agent-runtime/settings';
import type { RuntimeHostInfo, RuntimeSandbox } from '../agent-runtime/types';

export type RuntimeHostStatus =
  | 'pending'
  | 'online'
  | 'offline'
  | 'unauthorized'
  | 'incompatible'
  | 'disabled';

export interface RuntimeHostUsage {
  sandboxCount: number;
  runningCount: number;
  cpu: number;
  memoryMb: number;
  diskMb: number;
  orphans: number;
  checkedAt: string | null;
}

export interface RuntimeHostItem {
  id: string;
  name: string;
  note: string | null;
  listenAddress: string | null;
  baseUrl: string | null;
  source: 'manual' | 'env';
  status: RuntimeHostStatus;
  enabled: boolean;
  version: string | null;
  protocolVersion: string | null;
  cpuTotal: number;
  memoryMbTotal: number;
  diskMbTotal: number;
  maxSandboxes: number;
  reservedCpu: number;
  reservedMemoryMb: number;
  reservedDiskMb: number;
  usage: RuntimeHostUsage;
  lastCheckedAt: string | null;
  lastOnlineAt: string | null;
  latencyMs: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuntimeHostParams {
  name: string;
  note?: string;
  listenAddress: string;
  capacity?: {
    cpuTotal?: number;
    memoryMbTotal?: number;
    diskMbTotal?: number;
    maxSandboxes?: number;
    reservedCpu?: number;
    reservedMemoryMb?: number;
    reservedDiskMb?: number;
  };
  createdBy?: string;
}

export interface UpdateRuntimeHostParams {
  name?: string;
  note?: string | null;
  enabled?: boolean;
  capacity?: {
    cpuTotal?: number;
    memoryMbTotal?: number;
    diskMbTotal?: number;
    maxSandboxes?: number;
    reservedCpu?: number;
    reservedMemoryMb?: number;
    reservedDiskMb?: number;
  };
}

export interface RuntimeHostService {
  list(): Promise<RuntimeHostItem[]>;
  getById(id: string): Promise<RuntimeHostItem | null>;
  create(params: CreateRuntimeHostParams): Promise<{
    item: RuntimeHostItem;
    installCommand: string;
  }>;
  update(id: string, params: UpdateRuntimeHostParams): Promise<RuntimeHostItem | null>;
  delete(id: string): Promise<void>;
  verify(id: string, baseUrl: string): Promise<RuntimeHostItem>;
  check(id: string): Promise<RuntimeHostItem>;
  rotateToken(id: string): Promise<{ item: RuntimeHostItem; installCommand: string }>;
  resolveConnection(id: string): Promise<{ baseUrl: string; token: string }>;
  countInstances(hostId: string): Promise<number>;
  ensureEnvHost(config: { baseUrl: string; token: string }): Promise<void>;
}

interface HostRow {
  id: string;
  name: string;
  note: string | null;
  listen_address: string | null;
  base_url: string | null;
  token_cipher: string | null;
  source: string;
  source_key: string | null;
  status: string;
  enabled: boolean;
  version: string | null;
  protocol_version: string | null;
  cpu_total: number;
  memory_mb_total: number;
  disk_mb_total: number;
  max_sandboxes: number;
  reserved_cpu: number;
  reserved_memory_mb: number;
  reserved_disk_mb: number;
  usage_json: unknown;
  last_checked_at: Date | string | null;
  last_online_at: Date | string | null;
  latency_ms: number | null;
  last_error: string | null;
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

function parseUsage(value: unknown): RuntimeHostUsage {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return {
      sandboxCount: 0,
      runningCount: 0,
      cpu: 0,
      memoryMb: 0,
      diskMb: 0,
      orphans: 0,
      checkedAt: null,
    };
  }
  const raw = parsed as Record<string, unknown>;
  return {
    sandboxCount: asNumber(raw.sandboxCount),
    runningCount: asNumber(raw.runningCount),
    cpu: asNumber(raw.cpu),
    memoryMb: asNumber(raw.memoryMb),
    diskMb: asNumber(raw.diskMb),
    orphans: asNumber(raw.orphans),
    checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : null,
  };
}

function mapHost(row: HostRow): RuntimeHostItem {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    listenAddress: row.listen_address,
    baseUrl: row.base_url,
    source: row.source === 'env' ? 'env' : 'manual',
    status: row.status as RuntimeHostStatus,
    enabled: Boolean(row.enabled),
    version: row.version,
    protocolVersion: row.protocol_version,
    cpuTotal: asNumber(row.cpu_total),
    memoryMbTotal: asNumber(row.memory_mb_total),
    diskMbTotal: asNumber(row.disk_mb_total),
    maxSandboxes: asNumber(row.max_sandboxes, 20),
    reservedCpu: asNumber(row.reserved_cpu),
    reservedMemoryMb: asNumber(row.reserved_memory_mb),
    reservedDiskMb: asNumber(row.reserved_disk_mb),
    usage: parseUsage(row.usage_json),
    lastCheckedAt: iso(row.last_checked_at),
    lastOnlineAt: iso(row.last_online_at),
    latencyMs: row.latency_ms === null ? null : asNumber(row.latency_ms),
    lastError: row.last_error,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
  };
}

function summarizeUsage(sandboxes: RuntimeSandbox[]): RuntimeHostUsage {
  let runningCount = 0;
  let cpu = 0;
  let memoryMb = 0;
  let diskMb = 0;
  for (const sandbox of sandboxes) {
    if (sandbox.state === 'RUNNING') {
      runningCount += 1;
      cpu += asNumber(sandbox.resources?.cpuCount);
      memoryMb += asNumber(sandbox.resources?.memoryMb);
    }
    if (sandbox.state !== 'DESTROYED') {
      diskMb += asNumber(sandbox.resources?.diskMb);
    }
  }
  return {
    sandboxCount: sandboxes.length,
    runningCount,
    cpu,
    memoryMb,
    diskMb,
    orphans: 0,
    checkedAt: new Date().toISOString(),
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function newHostToken(): string {
  return randomBytes(32).toString('hex');
}

function hostError(code: string, message: string, status = 400): Error {
  return new VentoStackError(message, status, code);
}

function protocolCompatible(
  info: RuntimeHostInfo | null,
  minProtocolVersion: number,
): boolean {
  if (!info?.protocolVersion) return true;
  const value = Number(info.protocolVersion);
  if (!Number.isFinite(value)) return true;
  return value >= minProtocolVersion;
}

export function createRuntimeHostService(deps: {
  db: Database;
  encryptor: ConfigEncryptor;
  settings: RuntimeSettings;
}): RuntimeHostService {
  const { db, encryptor, settings } = deps;

  async function getRaw(id: string): Promise<HostRow | null> {
    const rows = (await db.raw('SELECT * FROM ai_runtime_host WHERE id = $1', [id])) as HostRow[];
    return rows[0] ?? null;
  }

  async function buildInstallCommand(row: HostRow, token: string): Promise<string> {
    const listen = row.listen_address || '<HOST_IP>:8088';
    return [
      `curl -fsSL ${shellQuote(settings.installerUrl)} \\`,
      `  | sudo bash -s -- \\`,
      `      --token ${shellQuote(token)} \\`,
      `      --listen ${shellQuote(listen)} \\`,
      `      --version ${shellQuote(settings.version)}`,
    ].join('\n');
  }

  async function markChecked(
    id: string,
    params: {
      status: RuntimeHostStatus;
      latencyMs?: number;
      version?: string | null;
      protocolVersion?: string | null;
      usage?: RuntimeHostUsage;
      error?: string | null;
      fillCapacity?: { cpuTotal: number; memoryMbTotal: number; diskMbTotal: number };
    },
  ): Promise<void> {
    const sets = [
      'status = $2',
      'last_checked_at = NOW()',
      'updated_at = NOW()',
      'latency_ms = $3',
      'version = COALESCE($4, version)',
      'protocol_version = COALESCE($5, protocol_version)',
      'last_error = $6',
      'usage_json = COALESCE($7::text::jsonb, usage_json)',
    ];
    const values: unknown[] = [
      id,
      params.status,
      params.latencyMs ?? null,
      params.version ?? null,
      params.protocolVersion ?? null,
      params.error ?? null,
      params.usage ? JSON.stringify(params.usage) : null,
    ];
    if (params.status === 'online') {
      sets.push('last_online_at = NOW()');
    }
    if (params.fillCapacity) {
      sets.push(
        'cpu_total = CASE WHEN cpu_total = 0 THEN $8 ELSE cpu_total END',
        'memory_mb_total = CASE WHEN memory_mb_total = 0 THEN $9 ELSE memory_mb_total END',
        'disk_mb_total = CASE WHEN disk_mb_total = 0 THEN $10 ELSE disk_mb_total END',
      );
      values.push(
        params.fillCapacity.cpuTotal,
        params.fillCapacity.memoryMbTotal,
        params.fillCapacity.diskMbTotal,
      );
    }
    await db.raw(
      `UPDATE ai_runtime_host SET ${sets.join(', ')} WHERE id = $1`,
      values,
    );
  }

  async function runCheck(row: HostRow): Promise<RuntimeHostItem> {
    if (!row.base_url) {
      throw hostError('RUNTIME_HOST_NOT_CONFIGURED', '宿主尚未配置连接地址', 400);
    }
    let token: string;
    try {
      token = row.token_cipher ? await encryptor.decrypt(row.token_cipher) : '';
    } catch {
      throw hostError('RUNTIME_HOST_TOKEN_INVALID', '宿主 Token 解密失败，请重新生成', 500);
    }
    try {
      const probe = await probeRuntimeHost(
        row.base_url,
        token,
        settings.hostCheckTimeoutMs,
      );
      const compatible = protocolCompatible(probe.info, settings.minProtocolVersion);
      const usage = summarizeUsage(probe.sandboxes);
      await markChecked(row.id, {
        status: compatible ? 'online' : 'incompatible',
        latencyMs: probe.latencyMs,
        version: probe.info?.version ?? null,
        protocolVersion:
          probe.info?.protocolVersion === undefined
            ? null
            : String(probe.info.protocolVersion),
        usage,
        error: compatible ? null : '宿主协议版本低于当前平台要求，请升级 Runtime',
        ...(probe.info?.host
          ? {
              fillCapacity: {
                cpuTotal: asNumber(probe.info.host.cpuCount),
                memoryMbTotal: asNumber(probe.info.host.memoryMb),
                diskMbTotal: asNumber(probe.info.host.diskMb),
              },
            }
          : {}),
      });
    } catch (error) {
      const code =
        (error as { errorCode?: string } | null)?.errorCode ??
        (typeof (error as { code?: unknown } | null)?.code === 'string'
          ? ((error as { code?: string }).code as string)
          : undefined);
      const status: RuntimeHostStatus =
        code === 'RUNTIME_HOST_UNAUTHORIZED'
          ? 'unauthorized'
          : code === 'RUNTIME_HOST_ERROR'
            ? 'offline'
            : 'offline';
      await markChecked(row.id, {
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const updated = await getRaw(row.id);
    if (!updated) throw hostError('RUNTIME_HOST_NOT_FOUND', '宿主不存在', 404);
    return mapHost(updated);
  }

  return {
    async list(): Promise<RuntimeHostItem[]> {
      const rows = (await db.raw(
        'SELECT * FROM ai_runtime_host ORDER BY created_at ASC',
      )) as HostRow[];
      return rows.map(mapHost);
    },

    async getById(id): Promise<RuntimeHostItem | null> {
      const row = await getRaw(id);
      return row ? mapHost(row) : null;
    },

    async create(params): Promise<{ item: RuntimeHostItem; installCommand: string }> {
      const id = crypto.randomUUID();
      const token = newHostToken();
      const tokenCipher = await encryptor.encrypt(token);
      const capacity = params.capacity ?? {};
      await db.raw(
        `INSERT INTO ai_runtime_host
          (id, name, note, listen_address, token_cipher, source, status, enabled,
           cpu_total, memory_mb_total, disk_mb_total, max_sandboxes,
           reserved_cpu, reserved_memory_mb, reserved_disk_mb, created_by)
         VALUES ($1,$2,$3,$4,$5,'manual','pending',TRUE,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          params.name,
          params.note ?? null,
          params.listenAddress,
          tokenCipher,
          capacity.cpuTotal ?? 0,
          capacity.memoryMbTotal ?? 0,
          capacity.diskMbTotal ?? 0,
          capacity.maxSandboxes ?? 20,
          capacity.reservedCpu ?? 0,
          capacity.reservedMemoryMb ?? 0,
          capacity.reservedDiskMb ?? 0,
          params.createdBy ?? null,
        ],
      );
      const row = await getRaw(id);
      if (!row) throw hostError('RUNTIME_HOST_CREATE_FAILED', '宿主创建失败', 500);
      return { item: mapHost(row), installCommand: await buildInstallCommand(row, token) };
    },

    async update(id, params): Promise<RuntimeHostItem | null> {
      const current = await getRaw(id);
      if (!current) return null;
      const capacity = params.capacity ?? {};
      await db.raw(
        `UPDATE ai_runtime_host SET
           name = COALESCE($2, name),
           note = CASE WHEN $3::boolean THEN $4 ELSE note END,
           enabled = COALESCE($5, enabled),
           cpu_total = COALESCE($6, cpu_total),
           memory_mb_total = COALESCE($7, memory_mb_total),
           disk_mb_total = COALESCE($8, disk_mb_total),
           max_sandboxes = COALESCE($9, max_sandboxes),
           reserved_cpu = COALESCE($10, reserved_cpu),
           reserved_memory_mb = COALESCE($11, reserved_memory_mb),
           reserved_disk_mb = COALESCE($12, reserved_disk_mb),
           updated_at = NOW()
         WHERE id = $1`,
        [
          id,
          params.name ?? null,
          params.note !== undefined,
          params.note ?? null,
          params.enabled ?? null,
          capacity.cpuTotal ?? null,
          capacity.memoryMbTotal ?? null,
          capacity.diskMbTotal ?? null,
          capacity.maxSandboxes ?? null,
          capacity.reservedCpu ?? null,
          capacity.reservedMemoryMb ?? null,
          capacity.reservedDiskMb ?? null,
        ],
      );
      const updated = await getRaw(id);
      return updated ? mapHost(updated) : null;
    },

    async delete(id): Promise<void> {
      await db.raw('DELETE FROM ai_runtime_host WHERE id = $1', [id]);
    },

    async verify(id, baseUrl): Promise<RuntimeHostItem> {
      const validated = validateRuntimeBaseUrl(baseUrl);
      const row = await getRaw(id);
      if (!row) throw hostError('RUNTIME_HOST_NOT_FOUND', '宿主不存在', 404);
      const duplicate = (await db.raw(
        `SELECT id, name FROM ai_runtime_host WHERE base_url = $1 AND id <> $2 LIMIT 1`,
        [validated, id],
      )) as Array<{ id: string; name: string }>;
      if (duplicate[0]) {
        throw hostError(
          'RUNTIME_HOST_ALREADY_REGISTERED',
          `该地址已被宿主「${duplicate[0].name}」接入，请勿重复添加`,
          409,
        );
      }
      await db.raw(
        `UPDATE ai_runtime_host
         SET base_url = $2,
             cpu_total = CASE WHEN base_url IS DISTINCT FROM $2 THEN 0 ELSE cpu_total END,
             memory_mb_total = CASE WHEN base_url IS DISTINCT FROM $2 THEN 0 ELSE memory_mb_total END,
             disk_mb_total = CASE WHEN base_url IS DISTINCT FROM $2 THEN 0 ELSE disk_mb_total END,
             version = CASE WHEN base_url IS DISTINCT FROM $2 THEN NULL ELSE version END,
             protocol_version = CASE WHEN base_url IS DISTINCT FROM $2 THEN NULL ELSE protocol_version END,
             status = CASE WHEN base_url IS DISTINCT FROM $2 THEN 'pending' ELSE status END,
             updated_at = NOW()
         WHERE id = $1`,
        [id, validated],
      );
      const updated = await getRaw(id);
      if (!updated) throw hostError('RUNTIME_HOST_NOT_FOUND', '宿主不存在', 404);
      return runCheck(updated);
    },

    async check(id): Promise<RuntimeHostItem> {
      const row = await getRaw(id);
      if (!row) throw hostError('RUNTIME_HOST_NOT_FOUND', '宿主不存在', 404);
      return runCheck(row);
    },

    async rotateToken(id): Promise<{ item: RuntimeHostItem; installCommand: string }> {
      const row = await getRaw(id);
      if (!row) throw hostError('RUNTIME_HOST_NOT_FOUND', '宿主不存在', 404);
      const token = newHostToken();
      const tokenCipher = await encryptor.encrypt(token);
      await db.raw(
        `UPDATE ai_runtime_host SET token_cipher = $2, status = 'pending', last_error = NULL, updated_at = NOW() WHERE id = $1`,
        [id, tokenCipher],
      );
      const updated = await getRaw(id);
      if (!updated) throw hostError('RUNTIME_HOST_NOT_FOUND', '宿主不存在', 404);
      return { item: mapHost(updated), installCommand: await buildInstallCommand(updated, token) };
    },

    async resolveConnection(id): Promise<{ baseUrl: string; token: string }> {
      const row = await getRaw(id);
      if (!row?.base_url || !row.token_cipher) {
        throw hostError('RUNTIME_HOST_NOT_CONFIGURED', '宿主尚未完成接入', 400);
      }
      return {
        baseUrl: row.base_url,
        token: await encryptor.decrypt(row.token_cipher),
      };
    },

    async countInstances(hostId): Promise<number> {
      const rows = (await db.raw(
        `SELECT COUNT(*)::int AS count FROM ai_agent_runtime
         WHERE host_id = $1`,
        [hostId],
      )) as Array<{ count: number }>;
      return asNumber(rows[0]?.count);
    },

    async ensureEnvHost(config): Promise<void> {
      const validated = validateRuntimeBaseUrl(config.baseUrl);
      const tokenCipher = await encryptor.encrypt(config.token);
      const existing = (await db.raw(
        `SELECT id FROM ai_runtime_host WHERE source_key = 'default' LIMIT 1`,
      )) as Array<{ id: string }>;
      if (existing[0]?.id) {
        await db.raw(
          `UPDATE ai_runtime_host
           SET base_url = $2, token_cipher = $3, enabled = TRUE,
               cpu_total = 0, memory_mb_total = 0, disk_mb_total = 0,
               version = NULL, protocol_version = NULL,
               status = 'pending', last_error = NULL, updated_at = NOW()
           WHERE id = $1`,
          [existing[0].id, validated, tokenCipher],
        );
        return;
      }
      await db.raw(
        `INSERT INTO ai_runtime_host
          (id, name, note, base_url, token_cipher, source, source_key, status, enabled)
         VALUES ($1, $2, $3, $4, $5, 'env', 'default', 'pending', TRUE)`,
        [
          crypto.randomUUID(),
          '默认虚拟机宿主（环境变量）',
          '由 VENTO_RUNTIME_URL / VENTO_RUNTIME_TOKEN 自动导入',
          validated,
          tokenCipher,
        ],
      );
    },
  };
}
