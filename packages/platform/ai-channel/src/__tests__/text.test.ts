import { describe, expect, test } from 'bun:test';
import {
  maskId,
  maskSensitive,
  shortId,
  splitMessage,
  stripMentions,
  truncateText,
} from '../shared/text';

describe('maskSensitive', () => {
  test('打码 sk- 前缀密钥', () => {
    expect(maskSensitive('key 是 sk-abcdefghijklmnop 请勿外传')).toBe('key 是 sk-*** 请勿外传');
  });

  test('打码 AWS Access Key', () => {
    expect(maskSensitive('AKIAABCDEFGHIJKLMNOP')).toBe('AKIA***');
  });

  test('打码 GitHub token', () => {
    expect(maskSensitive(`token: ghp_${'a'.repeat(20)}`)).toBe('token: gh***');
  });

  test('打码 Bearer token（大小写不敏感）', () => {
    expect(maskSensitive('authorization: bearer abcdefghijklmnopqrst')).toBe(
      'authorization: Bearer ***',
    );
  });

  test('打码手机号', () => {
    expect(maskSensitive('联系方式 13812345678')).toBe('联系方式 138****0000');
  });

  test('打码身份证号', () => {
    expect(maskSensitive('证件 110101199003071234 已核验')).toBe('证件 ***身份证已打码*** 已核验');
  });

  test('手机号规则不误伤身份证内的数字串', () => {
    // 身份证里的 1 后面紧跟 9，但前面是数字，lookbehind 拦住
    const out = maskSensitive('110101199003071234');
    expect(out).toBe('***身份证已打码***');
  });

  test('64 位以上连续 token 折叠为省略提示', () => {
    const secret = 'A'.repeat(70);
    expect(maskSensitive(secret)).toBe(`${'A'.repeat(6)}***（已省略 64 字符）`);
  });

  test('普通长中文不误伤', () => {
    const text = '这是一段很长的中文说明'.repeat(10);
    expect(maskSensitive(text)).toBe(text);
  });

  test('空串与无敏感内容原样返回', () => {
    expect(maskSensitive('')).toBe('');
    expect(maskSensitive('今天天气不错')).toBe('今天天气不错');
  });
});

describe('truncateText', () => {
  test('未超长时原样返回', () => {
    expect(truncateText('abc', 5)).toBe('abc');
  });

  test('按码点截断，不切碎 emoji', () => {
    expect(truncateText('😀😀😀', 2)).toBe('😀😀');
  });

  test('上限 <= 0 时返回空串', () => {
    expect(truncateText('abc', 0)).toBe('');
    expect(truncateText('abc', -1)).toBe('');
  });
});

describe('splitMessage', () => {
  test('空文本返回空数组', () => {
    expect(splitMessage('', 100)).toEqual([]);
  });

  test('未超限时返回单条', () => {
    expect(splitMessage('abc', 100)).toEqual(['abc']);
  });

  test('优先在段落/句末标点处断开', () => {
    const text = '这是第一句话。'.repeat(50);
    const parts = splitMessage(text, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]?.endsWith('。')).toBe(true);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(100);
  });

  test('无可用断点时硬切，且不丢内容', () => {
    const parts = splitMessage('a'.repeat(250), 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
    expect(parts.join('')).toBe('a'.repeat(250));
  });

  test('断点过于靠前（< 30% 容量）时放弃该断点', () => {
    // '。' 在 index 0，不满足 30% 阈值，应退化为满容量硬切
    const parts = splitMessage(`。${'a'.repeat(200)}`, 100);
    expect(parts[0]?.length).toBe(100);
  });

  test('多段文本内容不丢失（忽略被 trim 的空白）', () => {
    const text = '第一段内容。第二段内容！第三段内容？'.repeat(20);
    const parts = splitMessage(text, 60);
    expect(parts.join('').replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });
});

describe('stripMentions', () => {
  test('剥离 @提及并压缩空白', () => {
    expect(stripMentions('@张三 你好')).toBe('你好');
  });

  test('多个提及', () => {
    expect(stripMentions('@bot @all 帮我查一下')).toBe('帮我查一下');
  });

  test('无提及时保持原样', () => {
    expect(stripMentions('你好')).toBe('你好');
  });
});

describe('shortId / maskId', () => {
  test('shortId 去掉连字符并取前 8 位', () => {
    expect(shortId('a1b2c3d4-1111-2222-3333-444455556666')).toBe('a1b2c3d4');
  });

  test('shortId 对短 id 不补位', () => {
    expect(shortId('abcd')).toBe('abcd');
  });

  test('maskId 保留首尾', () => {
    expect(maskId('abcdefghij')).toBe('abcd***ghij');
  });

  test('maskId 对短值只留前缀', () => {
    expect(maskId('ab')).toBe('ab***');
  });
});
