/**
 * 专家团委派工具（expert team delegation）
 *
 * 团队专家以「协调者 + 成员」模式运行时注入：协调者（主 LLM 运行）通过本工具
 * 把子任务委派给成员专家独立运行（独立上下文/独立会话），结果作为工具结果返回。
 *
 * 深度限制：子运行由装配层（delegateRunner）执行，其运行参数不携带任何委派能力
 * （无 expertId、无 delegateRunner、agentId 为空 → registry 工具白名单为空），
 * 因此委派深度天然为 1，无法递归套娃。
 */

export interface DelegateMember {
  /** 成员专家记录 ID */
  id: string;
  slug: string;
  name: string;
  description?: string;
}

export interface DelegateExpertToolDeps {
  /** 当前可委派的成员清单（运行级解析，缺一不可由上游 fail-closed 保证） */
  members: DelegateMember[];
  /** 执行子运行（由装配层注入；内部为新独立的 agent-loop 运行） */
  runDelegate: (memberExpertId: string, task: string) => Promise<string>;
}

export function createDelegateExpertTool(deps: DelegateExpertToolDeps) {
  const memberList = deps.members
    .map((m) => `- ${m.slug}（${m.name}）${m.description ? `：${m.description}` : ''}`)
    .join('\n');
  const memberSlugs = deps.members.map((m) => m.slug).join('、');

  return {
    name: 'delegate_expert',
    description:
      `把一个子任务委派给团队成员专家独立完成。成员专家在独立上下文中运行，只看到你委派的任务描述，` +
      `返回其最终成果文本。使用时机：任务可按专业分工拆解时（如评审、测试、文档各由对应成员负责）。` +
      `委派时必须把该成员完成任务所需的全部上下文写进 task（成员看不到当前对话）。\n` +
      `当前可委派的成员：\n${memberList}`,
    parameters: {
      type: 'object' as const,
      properties: {
        member: {
          type: 'string',
          description: `成员专家 slug，必须是以下之一：${memberSlugs}`,
        },
        task: {
          type: 'string',
          description: '委派给成员的完整任务描述，需自包含（成员看不到当前对话历史）',
        },
      },
      required: ['member', 'task'],
      additionalProperties: false,
    },
    label: 'delegate_expert',
    async execute(
      _toolCallId: string,
      params: { member?: string; task?: string },
    ): Promise<{
      content: Array<{ type: 'text'; text: string }>;
      details: Record<string, unknown>;
    }> {
      const member = params.member?.trim();
      const task = params.task?.trim();
      if (!member) {
        return {
          content: [{ type: 'text', text: '错误：member 不能为空' }],
          details: { ok: false },
        };
      }
      if (!task) {
        return {
          content: [{ type: 'text', text: '错误：task 不能为空' }],
          details: { ok: false },
        };
      }
      if (task.length > 20000) {
        return {
          content: [{ type: 'text', text: '错误：task 过长（上限 20000 字符）' }],
          details: { ok: false },
        };
      }

      const target = deps.members.find((m) => m.slug === member || m.id === member);
      if (!target) {
        return {
          content: [
            { type: 'text', text: `错误：未知成员「${member}」。可委派的成员：${memberSlugs}` },
          ],
          details: { ok: false },
        };
      }

      try {
        const result = await deps.runDelegate(target.id, task);
        return {
          content: [
            { type: 'text', text: `【成员 ${target.name}（${target.slug}）的成果】\n${result}` },
          ],
          details: { ok: true, member: target.slug },
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `错误：成员 ${target.slug} 执行失败：${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: { ok: false, member: target.slug },
        };
      }
    },
  };
}
