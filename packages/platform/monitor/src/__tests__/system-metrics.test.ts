import { describe, expect, test } from 'bun:test';
import {
  calculateCpuUsage,
  collectDiskUsage,
  type CpuSnapshot,
  type FileSystemStats,
} from '../services/system-metrics';

describe('system metrics', () => {
  test('calculates CPU usage from time deltas instead of load average', () => {
    const before: CpuSnapshot = [{ idle: 800, total: 1_000 }];
    const after: CpuSnapshot = [{ idle: 850, total: 1_200 }];

    expect(calculateCpuUsage(before, after)).toBeCloseTo(0.75);
  });

  test('clamps malformed CPU samples to a valid ratio', () => {
    expect(calculateCpuUsage([{ idle: 0, total: 0 }], [{ idle: 0, total: 0 }])).toBe(0);
    expect(calculateCpuUsage([{ idle: 100, total: 100 }], [{ idle: 50, total: 200 }])).toBe(1);
  });

  test('collects disk bytes through statfs for Windows and Unix roots', async () => {
    const stats: FileSystemStats = { bsize: 4096, blocks: 100, bfree: 25 };

    const windows = await collectDiskUsage('C:\\', async () => stats);
    const unix = await collectDiskUsage('/', async () => stats);

    expect(windows).toEqual({
      available: true,
      mount: 'C:\\',
      total: 409_600,
      used: 307_200,
      usage: 0.75,
    });
    expect(unix).toEqual({
      available: true,
      mount: '/',
      total: 409_600,
      used: 307_200,
      usage: 0.75,
    });
  });

  test('reports unavailable disk metrics instead of fake zero usage', async () => {
    const result = await collectDiskUsage('/', async () => {
      throw new Error('unsupported');
    });

    expect(result.available).toBe(false);
    expect(result.total).toBe(0);
    expect(result.used).toBe(0);
  });
});
