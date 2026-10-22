/**
 * 渠道目录的一致性守卫
 *
 * 「接入步骤里的平台名可点击」靠的是**文案匹配**（目录是纯数据，前端负责把命中的片段渲染成 `<a>`），
 * 这种隐式约定最容易在改文案时静默失效：步骤文案改了、链接却还挂着一个匹配不到的词，
 * 页面上就再也没有可点的入口，而且不报任何错。
 *
 * 所以这里把两件事锁死：
 *   1. 每个 setupLink.text 必须真的出现在该渠道某条 setupGuide 文案里
 *   2. href 必须是 https 绝对地址（避免相对路径指到自己页面）
 */

import { describe, expect, test } from 'bun:test';
import { CHANNEL_CATALOG } from '../catalog';

describe('渠道目录 setupLinks', () => {
  test('每个链接文案都能在某条接入步骤里匹配到', () => {
    for (const entry of CHANNEL_CATALOG) {
      for (const link of entry.setupLinks ?? []) {
        const hit = entry.setupGuide.some((step) => step.includes(link.text));
        expect({ type: entry.type, link: link.text, hit }).toEqual({
          type: entry.type,
          link: link.text,
          hit: true,
        });
      }
    }
  });

  test('链接只指向 https 绝对地址', () => {
    for (const entry of CHANNEL_CATALOG) {
      for (const link of entry.setupLinks ?? []) {
        expect(link.href.startsWith('https://')).toBe(true);
        expect(link.href).not.toContain(' ');
      }
    }
  });

  test('QQ 渠道的开放平台入口指向 q.qq.com', () => {
    const qq = CHANNEL_CATALOG.find((entry) => entry.type === 'qqbot');
    expect(qq).toBeDefined();
    const link = qq?.setupLinks?.find((item) => item.text === 'QQ 开放平台');
    expect(link?.href).toBe('https://q.qq.com/');
    // 步骤文案里必须留着这个词，否则前端匹配不到就不会渲染成链接
    expect(qq?.setupGuide.some((step) => step.includes('QQ 开放平台'))).toBe(true);
  });
});
