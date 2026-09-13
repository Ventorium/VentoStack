import { describe, expect, mock, test } from 'bun:test';
import { normalizePresetConfigs } from './019_normalize_preset_configs';

describe('019_normalize_preset_configs', () => {
  test('normalizes AI trace switch to boolean config type', async () => {
    const executor = mock(async () => []);
    await normalizePresetConfigs.up(executor);
    expect(executor).toHaveBeenCalledWith(
      "UPDATE sys_config SET type = 2 WHERE key = 'ai_trace_enabled' AND type <> 2",
    );
  });
});
