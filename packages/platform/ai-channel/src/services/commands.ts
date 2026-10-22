/**
 * 渠道内命令处理
 *
 * 返回「要回复的文本」，发送交给管线——命令层不碰 outbound，
 * 这样命令能在单测里完全脱离网络与数据库跑通（注入假 deps）。
 */

import { type ChannelCommand, helpText, unknownCommandText } from '../shared/command';
import { shortId } from '../shared/text';
import type { AiSessionServiceLike, ChannelRuntimeConfig, IdentityRow } from '../types';
import type { IdentityService } from './identity';
import type { SessionLinkService } from './session-link';

export interface CommandDeps {
  ai: AiSessionServiceLike;
  identity: IdentityService;
  links: SessionLinkService;
  /** 中断进行中的运行；返回是否真的存在运行 */
  stopRun(sessionId: string): boolean;
  /** 是否存在进行中的运行 */
  isRunning(sessionId: string): boolean;
}

export interface CommandContext {
  cfg: ChannelRuntimeConfig;
  command: ChannelCommand;
  identity: IdentityRow | null;
  agentId: string;
  externalKey: string;
  externalUserId: string;
  externalChatId: string;
  displayName?: string;
  /** 当前绑定的会话（未绑定时为 null） */
  sessionId: string | null;
}

export interface CommandOutcome {
  reply: string;
  /** 命令改变了绑定关系时回传新 sessionId（供管线更新内存状态） */
  sessionId?: string;
}

const BIND_GUIDE = [
  '你还没有绑定账号，暂时无法对话（避免他人消耗你的额度）。',
  '绑定方法：',
  '1. 打开 Web 端 → AI → 对话渠道',
  '2. 点击对应渠道的「绑定我的账号」，拿到 6 位验证码',
  '3. 在这里发送 /绑定 验证码',
].join('\n');

export function bindGuide(): string {
  return BIND_GUIDE;
}

export async function runCommand(ctx: CommandContext, deps: CommandDeps): Promise<CommandOutcome> {
  const { command, cfg, identity } = ctx;
  const scope = { tenantId: cfg.tenantId, userId: cfg.userId };

  if (command.kind === 'help') {
    return { reply: helpText(cfg.name) };
  }

  if (command.kind === 'bind') {
    if (!command.code) return { reply: '用法：/绑定 123456（验证码在 Web 端渠道页获取）' };
    const result = await deps.identity.redeemBindCode({
      code: command.code,
      channelId: cfg.id,
      externalUserId: ctx.externalUserId,
      externalChatId: ctx.externalChatId,
      ...(ctx.displayName ? { displayName: ctx.displayName } : {}),
    });
    if (!result.ok) return { reply: `绑定失败：${result.reason ?? '未知原因'}` };
    return { reply: '绑定成功，现在可以直接对话了。发送 /帮助 查看可用命令。' };
  }

  if (command.kind === 'unknown') {
    return { reply: unknownCommandText(command.raw) };
  }

  // 其余命令都需要已绑定身份
  if (!identity) return { reply: BIND_GUIDE };
  // 身份必须属于当前渠道的归属用户，否则视为未绑定（防止渠道被转移后旧绑定生效）
  if (identity.user_id !== cfg.userId) return { reply: BIND_GUIDE };

  if (command.kind === 'new') {
    const { sessionId } = await deps.ai.create({
      tenantId: cfg.tenantId,
      userId: cfg.userId,
      agentId: ctx.agentId,
      origin: { kind: 'channel', channelId: cfg.id, channelType: cfg.type },
    });
    await deps.links.bind({
      channelId: cfg.id,
      tenantId: cfg.tenantId,
      userId: cfg.userId,
      externalKey: ctx.externalKey,
      sessionId,
      agentId: ctx.agentId,
      origin: 'inbound',
    });
    return { reply: `已开启新对话（#${shortId(sessionId)}）`, sessionId };
  }

  if (command.kind === 'sessions') {
    const sessions = await deps.ai.list({ ...scope, agentId: ctx.agentId });
    const recent = sessions.slice(0, 5);
    if (recent.length === 0) return { reply: '还没有会话，直接发消息即可开始。' };
    const lines = recent.map((session, index) => {
      const current = session.sessionId === ctx.sessionId ? ' ← 当前' : '';
      return `${index + 1}. #${shortId(session.sessionId)} ${session.title ?? '未命名'}${current}`;
    });
    return {
      // 序号会随「最近活跃」变化（刚开的新会话会顶到第 1 位），所以把短 ID 一并给出，
      // 并明确两种写法都能用，避免用户按上一屏的序号切换却切到别的会话
      reply: [
        '最近会话：',
        ...lines,
        '',
        '发送 /切换 编号 或 /切换 #短ID 切换，例如 /切换 1 或 /切换 #a1b2c3d4',
        '（编号会随最近活跃变化，想准确定位请用短 ID）',
      ].join('\n'),
    };
  }

  if (command.kind === 'switch') {
    const sessions = await deps.ai.list({ ...scope, agentId: ctx.agentId });
    // 列表里展示的是 #短ID，用户很可能连 # 一起发过来，这里容错
    const target = command.target.replace(/^#/, '').trim();
    // 支持「序号」与「短 id 前缀」两种写法，减少用户在手机上的输入成本
    const byIndex = Number.parseInt(target, 10);
    const matched =
      Number.isFinite(byIndex) && String(byIndex) === target
        ? sessions[byIndex - 1]
        : sessions.find((session) => shortId(session.sessionId).startsWith(target.toLowerCase()));
    if (!matched) return { reply: `没找到会话「${target}」。发送 /会话 查看列表。` };
    await deps.links.bind({
      channelId: cfg.id,
      tenantId: cfg.tenantId,
      userId: cfg.userId,
      externalKey: ctx.externalKey,
      sessionId: matched.sessionId,
      agentId: ctx.agentId,
      origin: 'inbound',
    });
    return {
      reply: `已切换到 #${shortId(matched.sessionId)} ${matched.title ?? '未命名'}`,
      sessionId: matched.sessionId,
    };
  }

  if (command.kind === 'current') {
    if (!ctx.sessionId) return { reply: '当前还没有会话，直接发消息即可开始。' };
    const session = await deps.ai.get(ctx.sessionId, scope);
    if (!session) return { reply: '当前会话已失效，下一条消息会自动开新会话。' };
    const running = deps.isRunning(session.sessionId);
    return {
      reply: [
        `会话：#${shortId(session.sessionId)}`,
        `标题：${session.title ?? '未命名'}`,
        `消息数：${session.messageCount}`,
        `状态：${running ? '正在生成回复' : '空闲'}`,
      ].join('\n'),
    };
  }

  if (command.kind === 'stop') {
    if (!ctx.sessionId) return { reply: '当前没有进行中的回复。' };
    const stopped = deps.stopRun(ctx.sessionId);
    return { reply: stopped ? '已停止本次回复。' : '当前没有进行中的回复。' };
  }

  return { reply: unknownCommandText('/') };
}
