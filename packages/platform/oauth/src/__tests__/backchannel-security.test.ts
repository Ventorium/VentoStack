import { describe, expect, test } from 'bun:test';
import { assertSafeBackchannelUrl } from '../services/backchannel-security';

describe('OAuth back-channel endpoint policy', () => {
  test('rejects loopback, link-local, private networks and non-HTTPS URLs', async () => {
    await expect(assertSafeBackchannelUrl('https://127.0.0.1/logout')).rejects.toThrow(
      'prohibited',
    );
    await expect(assertSafeBackchannelUrl('https://169.254.169.254/latest')).rejects.toThrow(
      'prohibited',
    );
    await expect(assertSafeBackchannelUrl('https://10.0.0.1/logout')).rejects.toThrow('prohibited');
    await expect(assertSafeBackchannelUrl('http://client.example/logout')).rejects.toThrow('HTTPS');
    await expect(assertSafeBackchannelUrl('https://client.example:8443/logout')).rejects.toThrow(
      'port 443',
    );
  });
});
