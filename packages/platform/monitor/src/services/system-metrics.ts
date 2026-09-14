import { statfs } from 'node:fs/promises';
import { parse } from 'node:path';
import { cpus, freemem, hostname, platform, arch, totalmem } from 'node:os';

export interface CpuSnapshotItem {
  idle: number;
  total: number;
}

export type CpuSnapshot = CpuSnapshotItem[];

export interface FileSystemStats {
  bsize: number;
  blocks: number;
  bfree: number;
}

export interface DiskUsage {
  available: boolean;
  usage: number;
  total: number;
  used: number;
  mount: string;
}

export interface SystemMetricsProvider {
  getCpuSnapshot(): CpuSnapshot;
  getCpuInfo(): { model: string; cores: number };
  getMemory(): { total: number; free: number };
  getOsInfo(): { platform: string; arch: string; hostname: string };
  getDiskUsage(): Promise<DiskUsage>;
  wait(milliseconds: number): Promise<void>;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function calculateCpuUsage(before: CpuSnapshot, after: CpuSnapshot): number {
  const count = Math.min(before.length, after.length);
  let idleDelta = 0;
  let totalDelta = 0;

  for (let index = 0; index < count; index++) {
    const previous = before[index]!;
    const current = after[index]!;
    idleDelta += current.idle - previous.idle;
    totalDelta += current.total - previous.total;
  }

  if (totalDelta <= 0) return 0;
  return clampRatio(1 - idleDelta / totalDelta);
}

export async function collectDiskUsage(
  mount: string,
  readStats: (path: string) => Promise<FileSystemStats> = statfs,
): Promise<DiskUsage> {
  try {
    const stats = await readStats(mount);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bfree) * Number(stats.bsize);
    const used = Math.max(0, total - free);
    return {
      available: total > 0,
      usage: total > 0 ? clampRatio(used / total) : 0,
      total,
      used,
      mount,
    };
  } catch {
    return { available: false, usage: 0, total: 0, used: 0, mount };
  }
}

function getCpuSnapshot(): CpuSnapshot {
  return cpus().map((cpu) => {
    const times = cpu.times;
    return {
      idle: times.idle,
      total: times.user + times.nice + times.sys + times.idle + times.irq,
    };
  });
}

export function createSystemMetricsProvider(): SystemMetricsProvider {
  return {
    getCpuSnapshot,
    getCpuInfo() {
      const values = cpus();
      return { model: values[0]?.model ?? 'unknown', cores: values.length };
    },
    getMemory() {
      return { total: totalmem(), free: freemem() };
    },
    getOsInfo() {
      return { platform: platform(), arch: arch(), hostname: hostname() };
    },
    getDiskUsage() {
      return collectDiskUsage(parse(process.cwd()).root);
    },
    wait(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    },
  };
}
