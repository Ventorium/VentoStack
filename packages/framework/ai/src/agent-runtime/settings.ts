import type { RuntimeResources } from './types';

export interface RuntimeUserLimits {
  /** 0 = 不限制 VM 数量 */
  maxInstances: number;
  /** 0 = 不限制 */
  maxCpu: number;
  /** 0 = 不限制 */
  maxMemoryMb: number;
  /** 0 = 不限制 */
  maxDiskMb: number;
}

export interface RuntimeWorkspaceBackupSettings {
  enabled: boolean;
  intervalMs: number;
  maxFileBytes: number;
  maxFiles: number;
  maxTotalBytes: number;
}

export interface RuntimeSettings {
  installerUrl: string;
  version: string;
  minProtocolVersion: number;
  defaultResources: RuntimeResources;
  userLimits: RuntimeUserLimits;
  hostCheckIntervalMs: number;
  hostCheckTimeoutMs: number;
  idleNotifyDays: number;
  staleNotifyDays: number;
  workspaceBackup: RuntimeWorkspaceBackupSettings;
  storagePath: string;
}

function intEnv(name: string, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return !['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
}

function stringEnv(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

/** 从环境变量构建运行时设置；测试可通过参数覆盖。 */
export function createRuntimeSettings(overrides: Partial<RuntimeSettings> = {}): RuntimeSettings {
  const defaultResources: RuntimeResources = {
    cpuCount: intEnv('AI_RUNTIME_VM_CPU', 2, 1, 32),
    memoryMb: intEnv('AI_RUNTIME_VM_MEMORY_MB', 4096, 128, 131072),
    diskMb: intEnv('AI_RUNTIME_VM_DISK_MB', 8192, 256, 1048576),
    maxProcesses: intEnv('AI_RUNTIME_VM_MAX_PROCESSES', 512, 1, 32768),
  };
  const settings: RuntimeSettings = {
    installerUrl: stringEnv(
      'VENTO_RUNTIME_INSTALLER_URL',
      'https://github.com/Ventorium/VentoAgentRuntime/releases/download/v0.1.0/install-host.sh',
    ),
    version: stringEnv('VENTO_RUNTIME_VERSION', '0.1.0'),
    minProtocolVersion: intEnv('VENTO_RUNTIME_MIN_PROTOCOL', 1, 0),
    defaultResources,
    userLimits: {
      // 用户明确要求：不限制单用户 VM 数量
      maxInstances: intEnv('AI_RUNTIME_USER_MAX_INSTANCES', 0, 0),
      maxCpu: intEnv('AI_RUNTIME_USER_MAX_CPU', 10, 0),
      maxMemoryMb: intEnv('AI_RUNTIME_USER_MAX_MEMORY_MB', 20480, 0),
      maxDiskMb: intEnv('AI_RUNTIME_USER_MAX_DISK_MB', 40960, 0),
    },
    hostCheckIntervalMs: intEnv('AI_RUNTIME_HOST_CHECK_INTERVAL_MS', 30_000, 5_000, 3_600_000),
    hostCheckTimeoutMs: intEnv('AI_RUNTIME_HOST_CHECK_TIMEOUT_MS', 5_000, 500, 60_000),
    idleNotifyDays: intEnv('AI_RUNTIME_IDLE_NOTIFY_DAYS', 15, 1, 3650),
    staleNotifyDays: intEnv('AI_RUNTIME_STALE_NOTIFY_DAYS', 30, 1, 3650),
    workspaceBackup: {
      enabled: boolEnv('AI_RUNTIME_WORKSPACE_BACKUP_ENABLED', true),
      intervalMs: intEnv('AI_RUNTIME_WORKSPACE_BACKUP_INTERVAL_MS', 600_000, 30_000, 86_400_000),
      maxFileBytes: intEnv('AI_RUNTIME_WORKSPACE_MAX_FILE_MB', 16, 1, 100) * 1024 * 1024,
      maxFiles: intEnv('AI_RUNTIME_WORKSPACE_MAX_FILES', 2000, 1, 100_000),
      maxTotalBytes: intEnv('AI_RUNTIME_WORKSPACE_MAX_TOTAL_MB', 512, 1, 102_400) * 1024 * 1024,
    },
    storagePath: stringEnv('AI_STORAGE_PATH', './data/ai'),
  };
  return {
    ...settings,
    ...overrides,
    defaultResources: { ...defaultResources, ...(overrides.defaultResources ?? {}) },
    userLimits: { ...settings.userLimits, ...(overrides.userLimits ?? {}) },
    workspaceBackup: { ...settings.workspaceBackup, ...(overrides.workspaceBackup ?? {}) },
  };
}
