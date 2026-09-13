import { describe, expect, test } from 'bun:test';
import { describeIPLocation } from '../services/ip-location';

describe('describeIPLocation', () => {
  test('识别本机地址', () => {
    expect(describeIPLocation('127.0.0.1')).toBe('本机');
    expect(describeIPLocation('::1')).toBe('本机');
    expect(describeIPLocation('::ffff:127.0.0.1')).toBe('本机');
  });

  test('识别 IPv4 和 IPv6 内网地址', () => {
    expect(describeIPLocation('10.0.0.1')).toBe('内网');
    expect(describeIPLocation('172.16.0.1')).toBe('内网');
    expect(describeIPLocation('192.168.1.1')).toBe('内网');
    expect(describeIPLocation('fd00::1')).toBe('内网');
  });

  test('公网或无效地址不猜测具体位置', () => {
    expect(describeIPLocation('203.0.113.9')).toBe('未知');
    expect(describeIPLocation('unknown')).toBe('未知');
  });
});
