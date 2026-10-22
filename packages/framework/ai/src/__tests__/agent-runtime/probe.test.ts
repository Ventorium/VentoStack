import { describe, expect, test } from 'bun:test';
import { validateRuntimeBaseUrl } from '../../agent-runtime/probe';

describe('runtime host URL validation', () => {
  test('allows private LAN http addresses', () => {
    expect(validateRuntimeBaseUrl('http://10.0.0.12:8088')).toBe('http://10.0.0.12:8088');
    expect(validateRuntimeBaseUrl('https://192.168.1.8:8443/')).toBe('https://192.168.1.8:8443');
  });

  test('rejects metadata, userinfo, non-http and malformed URLs', () => {
    for (const value of [
      'http://169.254.169.254/latest/meta-data',
      'http://user:pass@10.0.0.12:8088',
      'ftp://10.0.0.12:8088',
      'http://10.0.0.12:8088/path?x=1',
      'not-a-url',
    ]) {
      expect(() => validateRuntimeBaseUrl(value)).toThrow();
    }
  });
});
