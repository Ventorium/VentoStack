import { describe, expect, test } from 'bun:test';
import { helpText, parseCommand, unknownCommandText } from '../shared/command';

describe('parseCommand', () => {
  test('普通文本不是命令', () => {
    expect(parseCommand('你好')).toEqual({ kind: 'none' });
    expect(parseCommand('帮我总结一下 /tmp 目录')).toEqual({ kind: 'none' });
  });

  test('/新对话 与别名', () => {
    expect(parseCommand('/新对话')).toEqual({ kind: 'new' });
    expect(parseCommand('/new')).toEqual({ kind: 'new' });
    expect(parseCommand('/reset')).toEqual({ kind: 'new' });
    expect(parseCommand('/NEW')).toEqual({ kind: 'new' });
  });

  test('全角斜杠与全角空格归一', () => {
    expect(parseCommand('／新对话')).toEqual({ kind: 'new' });
    expect(parseCommand('／切换\u30001')).toEqual({ kind: 'switch', target: '1' });
  });

  test('前导空白不影响识别', () => {
    expect(parseCommand('   /help')).toEqual({ kind: 'help' });
  });

  test('/会话 与别名', () => {
    expect(parseCommand('/会话')).toEqual({ kind: 'sessions' });
    expect(parseCommand('/sessions')).toEqual({ kind: 'sessions' });
    expect(parseCommand('/list')).toEqual({ kind: 'sessions' });
    expect(parseCommand('/列表')).toEqual({ kind: 'sessions' });
  });

  test('/切换 带参数', () => {
    expect(parseCommand('/切换 3')).toEqual({ kind: 'switch', target: '3' });
    expect(parseCommand('/switch a1b2c3d4')).toEqual({ kind: 'switch', target: 'a1b2c3d4' });
  });

  test('/切换 缺参数时退化为会话列表', () => {
    expect(parseCommand('/切换')).toEqual({ kind: 'sessions' });
    expect(parseCommand('/switch')).toEqual({ kind: 'sessions' });
  });

  test('/当前 与 /停止', () => {
    expect(parseCommand('/当前')).toEqual({ kind: 'current' });
    expect(parseCommand('/status')).toEqual({ kind: 'current' });
    expect(parseCommand('/停止')).toEqual({ kind: 'stop' });
    expect(parseCommand('/stop')).toEqual({ kind: 'stop' });
  });

  test('/绑定 解析 6 位码', () => {
    expect(parseCommand('/绑定 123456')).toEqual({ kind: 'bind', code: '123456' });
    expect(parseCommand('/bind 123456')).toEqual({ kind: 'bind', code: '123456' });
  });

  test('/绑定 缺参数时 code 为空串（由命令处理器提示）', () => {
    expect(parseCommand('/绑定')).toEqual({ kind: 'bind', code: '' });
  });

  test('/帮助 与 /?', () => {
    expect(parseCommand('/帮助')).toEqual({ kind: 'help' });
    expect(parseCommand('/help')).toEqual({ kind: 'help' });
    expect(parseCommand('/?')).toEqual({ kind: 'help' });
  });

  test('未知命令带上原文，便于回显', () => {
    expect(parseCommand('/foo')).toEqual({ kind: 'unknown', raw: '/foo' });
    expect(parseCommand('/新会话')).toEqual({ kind: 'unknown', raw: '/新会话' });
  });

  test('只有斜杠时视为未知命令', () => {
    expect(parseCommand('/')).toEqual({ kind: 'unknown', raw: '/' });
  });
});

describe('文案', () => {
  test('帮助文案包含全部命令且注入渠道名', () => {
    const text = helpText('企业微信');
    expect(text).toContain('企业微信');
    for (const cmd of ['/新对话', '/会话', '/切换', '/当前', '/停止', '/绑定', '/帮助']) {
      expect(text).toContain(cmd);
    }
  });

  test('未知命令文案回显原文并指向 /帮助', () => {
    const text = unknownCommandText('/foo');
    expect(text).toContain('/foo');
    expect(text).toContain('/帮助');
  });
});
