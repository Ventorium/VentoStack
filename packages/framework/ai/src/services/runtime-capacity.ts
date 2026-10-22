import { VentoStackError } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import type { RuntimeResources } from '../agent-runtime/types';
import type { RuntimeSettings, RuntimeUserLimits } from '../agent-runtime/settings';
import type { RuntimeHostItem, RuntimeHostService } from './runtime-host';

export interface RuntimeUserUsage {
  instances: number;
  cpu: number;
  memoryMb: number;
  diskMb: number;
}

export interface RuntimeHostAvailability {
  hostId: string;
  cpu: number;
  memoryMb: number;
  diskMb: number;
  slots: number;
}

export interface RuntimeAvailability {
  available: boolean;
  onlineHostCount: number;
  hostCount: number;
  capacity: {
    cpu: number;
    memoryMb: number;
    diskMb: number;
    slots: number;
  };
  userUsage: RuntimeUserUsage;
  userLimits: RuntimeUserLimits;
  defaultResources: RuntimeResources;
  warnings: string[];
}

export interface RuntimeCapacityService {
  getUserUsage(tenantId: string, userId: string): Promise<RuntimeUserUsage>;
  getUserLimits(tenantId: string, userId: string): Promise<RuntimeUserLimits>;
  getAvailability(
    tenantId: string,
    userId: string,
    resources?: RuntimeResources,
  ): Promise<RuntimeAvailability>;
  selectHost(
    tenantId: string,
    userId: string,
    resources: RuntimeResources,
  ): Promise<RuntimeHostItem>;
  assertCanEnable(tenantId: string, userId: string): Promise<RuntimeAvailability>;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hostAvailable(host: RuntimeHostItem): RuntimeHostAvailability {
  return {
    hostId: host.id,
    cpu: Math.max(0, host.cpuTotal - host.reservedCpu - host.usage.cpu),
    memoryMb: Math.max(0, host.memoryMbTotal - host.reservedMemoryMb - host.usage.memoryMb),
    diskMb: Math.max(0, host.diskMbTotal - host.reservedDiskMb - host.usage.diskMb),
    slots: Math.max(0, host.maxSandboxes - host.usage.sandboxCount),
  };
}

function fits(available: RuntimeHostAvailability, resources: RuntimeResources): boolean {
  return (
    available.cpu >= resources.cpuCount &&
    available.memoryMb >= resources.memoryMb &&
    available.diskMb >= resources.diskMb &&
    available.slots >= 1
  );
}

function capacityError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Error {
  const error = new VentoStackError(message, status, code);
  (error as VentoStackError & { details?: Record<string, unknown> }).details = details;
  return error;
}

export function createRuntimeCapacityService(deps: {
  db: Database;
  hostService: RuntimeHostService;
  settings: RuntimeSettings;
}): RuntimeCapacityService {
  const { db, hostService, settings } = deps;

  async function getUserUsage(tenantId: string, userId: string): Promise<RuntimeUserUsage> {
    const rows = (await db.raw(
      `SELECT
         COUNT(*)::int AS instances,
         COALESCE(SUM(CASE WHEN state <> 'destroyed' THEN cpu_count ELSE 0 END), 0)::int AS cpu,
         COALESCE(SUM(CASE WHEN state <> 'destroyed' THEN memory_mb ELSE 0 END), 0)::int AS memory_mb,
         COALESCE(SUM(CASE WHEN state <> 'destroyed' THEN disk_mb ELSE 0 END), 0)::int AS disk_mb
       FROM ai_agent_runtime
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    )) as Array<{
      instances: number;
      cpu: number;
      memory_mb: number;
      disk_mb: number;
    }>;
    const row = rows[0];
    return {
      instances: asNumber(row?.instances),
      cpu: asNumber(row?.cpu),
      memoryMb: asNumber(row?.memory_mb),
      diskMb: asNumber(row?.disk_mb),
    };
  }

  async function getUserLimits(tenantId: string, userId: string): Promise<RuntimeUserLimits> {
    const rows = (await db.raw(
      `SELECT max_instances, max_cpu, max_memory_mb, max_disk_mb
       FROM ai_runtime_user_quota WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    )) as Array<{
      max_instances: number;
      max_cpu: number;
      max_memory_mb: number;
      max_disk_mb: number;
    }>;
    const row = rows[0];
    if (!row) return settings.userLimits;
    return {
      maxInstances: asNumber(row.max_instances),
      maxCpu: asNumber(row.max_cpu),
      maxMemoryMb: asNumber(row.max_memory_mb),
      maxDiskMb: asNumber(row.max_disk_mb),
    };
  }

  function checkUserLimits(
    usage: RuntimeUserUsage,
    limits: RuntimeUserLimits,
    resources: RuntimeResources,
  ): void {
    if (limits.maxInstances > 0 && usage.instances + 1 > limits.maxInstances) {
      throw capacityError(
        'RUNTIME_USER_LIMIT_EXCEEDED',
        `当前用户虚拟机数量已达上限（${limits.maxInstances} 台）`,
        409,
        { limit: 'maxInstances', used: usage.instances, max: limits.maxInstances },
      );
    }
    if (limits.maxCpu > 0 && usage.cpu + resources.cpuCount > limits.maxCpu) {
      throw capacityError(
        'RUNTIME_USER_LIMIT_EXCEEDED',
        `当前用户 CPU 配额不足（已用 ${usage.cpu}，上限 ${limits.maxCpu}）`,
        409,
        { limit: 'maxCpu', used: usage.cpu, required: resources.cpuCount, max: limits.maxCpu },
      );
    }
    if (limits.maxMemoryMb > 0 && usage.memoryMb + resources.memoryMb > limits.maxMemoryMb) {
      throw capacityError(
        'RUNTIME_USER_LIMIT_EXCEEDED',
        `当前用户内存配额不足（已用 ${usage.memoryMb} MB，上限 ${limits.maxMemoryMb} MB）`,
        409,
        {
          limit: 'maxMemoryMb',
          used: usage.memoryMb,
          required: resources.memoryMb,
          max: limits.maxMemoryMb,
        },
      );
    }
    if (limits.maxDiskMb > 0 && usage.diskMb + resources.diskMb > limits.maxDiskMb) {
      throw capacityError(
        'RUNTIME_USER_LIMIT_EXCEEDED',
        `当前用户磁盘配额不足（已用 ${usage.diskMb} MB，上限 ${limits.maxDiskMb} MB）`,
        409,
        {
          limit: 'maxDiskMb',
          used: usage.diskMb,
          required: resources.diskMb,
          max: limits.maxDiskMb,
        },
      );
    }
  }

  async function getAvailability(
    tenantId: string,
    userId: string,
    resources: RuntimeResources = settings.defaultResources,
  ): Promise<RuntimeAvailability> {
    const [hosts, userUsage, userLimits] = await Promise.all([
      hostService.list(),
      getUserUsage(tenantId, userId),
      getUserLimits(tenantId, userId),
    ]);
    const enabled = hosts.filter((host) => host.enabled);
    const online = enabled.filter((host) => host.status === 'online');
    const capacity = online.reduce(
      (acc, host) => {
        const available = hostAvailable(host);
        acc.cpu += available.cpu;
        acc.memoryMb += available.memoryMb;
        acc.diskMb += available.diskMb;
        acc.slots += available.slots;
        return acc;
      },
      { cpu: 0, memoryMb: 0, diskMb: 0, slots: 0 },
    );
    const remaining = {
      cpu: userLimits.maxCpu > 0 ? Math.max(0, userLimits.maxCpu - userUsage.cpu) : Infinity,
      memoryMb:
        userLimits.maxMemoryMb > 0
          ? Math.max(0, userLimits.maxMemoryMb - userUsage.memoryMb)
          : Infinity,
      diskMb:
        userLimits.maxDiskMb > 0
          ? Math.max(0, userLimits.maxDiskMb - userUsage.diskMb)
          : Infinity,
    };
    const available =
      online.length > 0 &&
      resources.cpuCount <= Math.min(capacity.cpu, remaining.cpu) &&
      resources.memoryMb <= Math.min(capacity.memoryMb, remaining.memoryMb) &&
      resources.diskMb <= Math.min(capacity.diskMb, remaining.diskMb) &&
      capacity.slots >= 1;
    const warnings: string[] = [];
    if (hosts.length === 0) warnings.push('尚未接入任何虚拟机宿主');
    else if (online.length === 0) warnings.push('当前没有在线的虚拟机宿主');
    if (!available && online.length > 0) {
      warnings.push('宿主剩余资源或用户配额不足，无法创建新的虚拟机');
    }
    return {
      available,
      onlineHostCount: online.length,
      hostCount: hosts.length,
      capacity,
      userUsage,
      userLimits,
      defaultResources: resources,
      warnings,
    };
  }

  async function selectHost(
    tenantId: string,
    userId: string,
    resources: RuntimeResources,
  ): Promise<RuntimeHostItem> {
    const [hosts, userUsage, userLimits] = await Promise.all([
      hostService.list(),
      getUserUsage(tenantId, userId),
      getUserLimits(tenantId, userId),
    ]);
    checkUserLimits(userUsage, userLimits, resources);
    const candidates = hosts
      .filter((host) => host.enabled && host.status === 'online')
      .map((host) => ({ host, available: hostAvailable(host) }))
      .filter((item) => fits(item.available, resources))
      .sort((a, b) => {
        // best-fit：优先选择仍能容纳但剩余最小的宿主，减少碎片
        const aCpu = a.available.cpu - resources.cpuCount;
        const bCpu = b.available.cpu - resources.cpuCount;
        if (aCpu !== bCpu) return aCpu - bCpu;
        return a.available.memoryMb - b.available.memoryMb;
      });
    if (candidates.length === 0) {
      throw capacityError(
        'RUNTIME_CAPACITY_EXHAUSTED',
        hosts.length === 0
          ? '尚未接入任何虚拟机宿主，请联系平台管理员'
          : '当前没有可用的虚拟机宿主资源，请稍后重试或联系平台管理员扩容',
        409,
        {
          reason: hosts.length === 0 ? 'no_online_host' : 'host_capacity_exhausted',
          required: resources,
          onlineHostCount: hosts.filter((host) => host.status === 'online').length,
        },
      );
    }
    return candidates[0]!.host;
  }

  async function assertCanEnable(
    tenantId: string,
    userId: string,
  ): Promise<RuntimeAvailability> {
    const availability = await getAvailability(tenantId, userId);
    if (!availability.available) {
      throw capacityError(
        'RUNTIME_CAPACITY_EXHAUSTED',
        availability.warnings[0] ?? '当前没有可用的虚拟机资源',
        409,
        {
          reason:
            availability.hostCount === 0
              ? 'no_online_host'
              : availability.onlineHostCount === 0
                ? 'no_online_host'
                : 'host_capacity_exhausted',
          availability,
        },
      );
    }
    return availability;
  }

  return {
    getUserUsage,
    getUserLimits,
    getAvailability,
    selectHost,
    assertCanEnable,
  };
}
