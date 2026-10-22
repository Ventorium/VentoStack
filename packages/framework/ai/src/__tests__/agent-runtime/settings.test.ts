import { describe, expect, test } from 'bun:test';
import { createRuntimeSettings } from '../../agent-runtime/settings';

describe('runtime settings', () => {
  test('does not limit VM count and keeps per-user resource caps', () => {
    const settings = createRuntimeSettings({ storagePath: './data/ai' });
    expect(settings.userLimits.maxInstances).toBe(0);
    expect(settings.userLimits.maxCpu).toBeGreaterThan(0);
    expect(settings.defaultResources.cpuCount).toBeGreaterThan(0);
    expect(settings.workspaceBackup.enabled).toBe(true);
  });

  test('accepts explicit overrides', () => {
    const settings = createRuntimeSettings({
      storagePath: '/tmp/ai',
      userLimits: { maxInstances: 0, maxCpu: 4, maxMemoryMb: 8192, maxDiskMb: 16384 },
      defaultResources: { cpuCount: 1, memoryMb: 1024, diskMb: 2048, maxProcesses: 256 },
    });
    expect(settings.userLimits.maxCpu).toBe(4);
    expect(settings.defaultResources.memoryMb).toBe(1024);
  });
});
