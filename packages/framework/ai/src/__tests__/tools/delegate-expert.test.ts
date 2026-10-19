import { describe, expect, test } from 'bun:test';
import { createDelegateExpertTool } from '../../tools/delegate-expert';

const MEMBERS = [
  { id: 'm1', slug: 'reviewer', name: '评审专家', description: '代码评审' },
  { id: 'm2', slug: 'writer', name: '文档专家' },
];

describe('createDelegateExpertTool', () => {
  test('成功委派：runDelegate 收到成员 id 与任务，结果带成员标注', async () => {
    const calls: Array<[string, string]> = [];
    const tool = createDelegateExpertTool({
      members: MEMBERS,
      runDelegate: async (id, task) => {
        calls.push([id, task]);
        return '成员成果文本';
      },
    });

    const result = await tool.execute('call-1', { member: 'reviewer', task: '评审这段代码' });
    expect(calls).toEqual([['m1', '评审这段代码']]);
    expect(result.content[0]!.text).toContain('【成员 评审专家（reviewer）的成果】');
    expect(result.content[0]!.text).toContain('成员成果文本');
    expect(result.details).toMatchObject({ ok: true, member: 'reviewer' });
  });

  test('支持按 id 委派', async () => {
    const tool = createDelegateExpertTool({
      members: MEMBERS,
      runDelegate: async (id) => {
        expect(id).toBe('m2');
        return 'ok';
      },
    });
    const result = await tool.execute('call-1', { member: 'm2', task: '写文档' });
    expect(result.details).toMatchObject({ ok: true, member: 'writer' });
  });

  test('未知成员拒绝并列出可委派清单', async () => {
    const tool = createDelegateExpertTool({ members: MEMBERS, runDelegate: async () => 'x' });
    const result = await tool.execute('call-1', { member: 'ghost', task: 'x' });
    expect(result.content[0]!.text).toContain('未知成员');
    expect(result.content[0]!.text).toContain('reviewer、writer');
  });

  test('参数缺失与超长拒绝', async () => {
    const tool = createDelegateExpertTool({ members: MEMBERS, runDelegate: async () => 'x' });
    expect((await tool.execute('c', {})).content[0]!.text).toContain('member 不能为空');
    expect((await tool.execute('c', { member: 'reviewer', task: '' })).content[0]!.text).toContain(
      'task 不能为空',
    );
    expect(
      (await tool.execute('c', { member: 'reviewer', task: 'a'.repeat(20001) })).content[0]!.text,
    ).toContain('task 过长');
  });

  test('子运行异常转为错误文本（工具不抛出）', async () => {
    const tool = createDelegateExpertTool({
      members: MEMBERS,
      runDelegate: async () => {
        throw new Error('模型不可用');
      },
    });
    const result = await tool.execute('call-1', { member: 'reviewer', task: 'x' });
    expect(result.content[0]!.text).toContain('执行失败');
    expect(result.content[0]!.text).toContain('模型不可用');
  });

  test('工具描述包含成员清单（供协调者选择）', () => {
    const tool = createDelegateExpertTool({ members: MEMBERS, runDelegate: async () => 'x' });
    expect(tool.description).toContain('reviewer');
    expect(tool.description).toContain('writer');
    expect(tool.parameters.required).toEqual(['member', 'task']);
  });
});
