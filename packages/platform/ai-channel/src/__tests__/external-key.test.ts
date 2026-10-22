import { describe, expect, test } from 'bun:test';
import {
  MAX_EXTERNAL_KEY_LENGTH,
  buildExternalKey,
  dmKey,
  isValidExternalKey,
  mqttKey,
  parseExternalKey,
} from '../shared/external-key';

describe('externalKey 构造', () => {
  test('私聊 key 用 dm: 前缀', () => {
    expect(dmKey('u_openid_1')).toBe('dm:u_openid_1');
  });

  test('IoT key 用 mqtt: 前缀', () => {
    expect(mqttKey('device-01')).toBe('mqtt:device-01');
  });

  test('buildExternalKey 按渠道类型分流', () => {
    expect(buildExternalKey('mqtt', 'device-01')).toBe('mqtt:device-01');
    expect(buildExternalKey('qqbot', 'u1')).toBe('dm:u1');
    expect(buildExternalKey('weixin-ilink', 'u1')).toBe('dm:u1');
    expect(buildExternalKey('feishu-app', 'u1')).toBe('dm:u1');
  });
});

describe('parseExternalKey', () => {
  test('解析私聊 key', () => {
    expect(parseExternalKey('dm:u1')).toEqual({ kind: 'dm', id: 'u1' });
  });

  test('解析 IoT key', () => {
    expect(parseExternalKey('mqtt:device-01')).toEqual({ kind: 'mqtt', id: 'device-01' });
  });

  test('id 中允许冒号（只切第一个前缀）', () => {
    expect(parseExternalKey('dm:a:b')).toEqual({ kind: 'dm', id: 'a:b' });
  });

  test('未知前缀返回 null', () => {
    expect(parseExternalKey('group:g1')).toBeNull();
    expect(parseExternalKey('u1')).toBeNull();
    expect(parseExternalKey('')).toBeNull();
  });
});

describe('isValidExternalKey', () => {
  test('正常 key 合法', () => {
    expect(isValidExternalKey('dm:u1')).toBe(true);
    expect(isValidExternalKey('mqtt:device-01')).toBe(true);
  });

  test('仅前缀（无 id）不合法', () => {
    expect(isValidExternalKey('dm:')).toBe(false);
    expect(isValidExternalKey('a')).toBe(false);
  });

  test('边界长度：255 合法，256 不合法', () => {
    expect(isValidExternalKey('x'.repeat(MAX_EXTERNAL_KEY_LENGTH))).toBe(true);
    expect(isValidExternalKey('x'.repeat(MAX_EXTERNAL_KEY_LENGTH + 1))).toBe(false);
  });
});
