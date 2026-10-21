/**
 * 召唤专家会话级持久化单元测试
 *
 * 回归背景：专家选择曾按「sessionId 变化即从 localStorage 恢复」实现，
 * 新会话创建（后端首次下发 sessionId）时内存态被存储里的空值覆盖，
 * 表现为召唤专家、问答一轮后选中效果消失。这里覆盖存储层的读写、脏数据容错与降级。
 */
import { describe, expect, test } from 'bun:test';
import type { ExpertSummonStorage } from '../expert-summon-storage';
import {
  parseSummonedExpert,
  readSummonedExpert,
  summonedExpertStorageKey,
  writeSummonedExpert,
} from '../expert-summon-storage';

/** 内存版存储：模拟 localStorage，并记录写入键值便于断言 */
function createMemoryStorage(initial: Record<string, string> = {}): ExpertSummonStorage & {
  dump: () => Record<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  };
}

describe('summonedExpertStorageKey', () => {
  test('会话 ID 拼上固定前缀，不同会话互不干扰', () => {
    expect(summonedExpertStorageKey('conv-1')).toBe('expert-summon:conv-1');
    expect(summonedExpertStorageKey('conv-2')).toBe('expert-summon:conv-2');
    expect(summonedExpertStorageKey('conv-1')).not.toBe(summonedExpertStorageKey('conv-2'));
  });
});

describe('writeSummonedExpert / readSummonedExpert', () => {
  test('写入后可按会话读回召唤态', () => {
    const storage = createMemoryStorage();
    writeSummonedExpert('conv-1', { id: 'exp-1', name: '代码审查专家', slug: 'reviewer' }, storage);
    expect(readSummonedExpert('conv-1', storage)).toEqual({
      id: 'exp-1',
      name: '代码审查专家',
      slug: 'reviewer',
    });
  });

  test('会话隔离：A 会话的召唤态不会出现在 B 会话', () => {
    const storage = createMemoryStorage();
    writeSummonedExpert('conv-1', { id: 'exp-1', name: '专家一' }, storage);
    expect(readSummonedExpert('conv-2', storage)).toBeNull();
  });

  test('写入 null 即取消召唤：删除该会话的持久化值', () => {
    const storage = createMemoryStorage();
    writeSummonedExpert('conv-1', { id: 'exp-1', name: '专家一' }, storage);
    writeSummonedExpert('conv-1', null, storage);
    expect(readSummonedExpert('conv-1', storage)).toBeNull();
    expect(storage.dump()).toEqual({});
  });

  test('无 slug 的专家也能往返', () => {
    const storage = createMemoryStorage();
    writeSummonedExpert('conv-1', { id: 'exp-1', name: '专家一' }, storage);
    expect(readSummonedExpert('conv-1', storage)).toEqual({ id: 'exp-1', name: '专家一' });
  });

  test('存储不可用（null）时读写均降级为无持久化，不抛错', () => {
    expect(readSummonedExpert('conv-1', null)).toBeNull();
    expect(() =>
      writeSummonedExpert('conv-1', { id: 'exp-1', name: '专家一' }, null),
    ).not.toThrow();
  });

  test('存储抛错（隐私模式 / 配额满）时静默降级', () => {
    const throwing: ExpertSummonStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readSummonedExpert('conv-1', throwing)).toBeNull();
    expect(() =>
      writeSummonedExpert('conv-1', { id: 'exp-1', name: '专家一' }, throwing),
    ).not.toThrow();
    expect(() => writeSummonedExpert('conv-1', null, throwing)).not.toThrow();
  });
});

describe('parseSummonedExpert', () => {
  test('空值与非法 JSON 一律视为未召唤', () => {
    expect(parseSummonedExpert(null)).toBeNull();
    expect(parseSummonedExpert('')).toBeNull();
    expect(parseSummonedExpert('{')).toBeNull();
    expect(parseSummonedExpert('not-json')).toBeNull();
  });

  test('非对象结构视为未召唤', () => {
    expect(parseSummonedExpert('"exp-1"')).toBeNull();
    expect(parseSummonedExpert('123')).toBeNull();
    expect(parseSummonedExpert('null')).toBeNull();
    expect(parseSummonedExpert('[]')).toBeNull();
  });

  test('缺少 id / name 或为空字符串时视为未召唤', () => {
    expect(parseSummonedExpert('{}')).toBeNull();
    expect(parseSummonedExpert('{"id":"exp-1"}')).toBeNull();
    expect(parseSummonedExpert('{"name":"专家一"}')).toBeNull();
    expect(parseSummonedExpert('{"id":"","name":"专家一"}')).toBeNull();
    expect(parseSummonedExpert('{"id":"exp-1","name":""}')).toBeNull();
    expect(parseSummonedExpert('{"id":1,"name":"专家一"}')).toBeNull();
  });

  test('只保留 id/name/slug 白名单字段，未知字段不进入内存态', () => {
    const parsed = parseSummonedExpert(
      '{"id":"exp-1","name":"专家一","slug":"reviewer","isAdmin":true,"systemPrompt":"x"}',
    );
    expect(parsed).toEqual({ id: 'exp-1', name: '专家一', slug: 'reviewer' });
    expect(parsed && Object.keys(parsed)).toEqual(['id', 'name', 'slug']);
  });

  test('slug 非字符串或为空时被丢弃', () => {
    expect(parseSummonedExpert('{"id":"exp-1","name":"专家一","slug":123}')).toEqual({
      id: 'exp-1',
      name: '专家一',
    });
    expect(parseSummonedExpert('{"id":"exp-1","name":"专家一","slug":""}')).toEqual({
      id: 'exp-1',
      name: '专家一',
    });
  });
});
