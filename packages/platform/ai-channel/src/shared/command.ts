/**
 * 渠道内命令解析
 *
 * 只有 `/新对话` 的话，用户切走就找不回旧会话，所以补齐 /会话、/切换、/当前、/停止。
 * 未知斜杠命令直接回「未知命令」，**不送模型**——避免把命令当自然语言瞎猜。
 */

export type ChannelCommand =
  | { kind: 'new' }
  | { kind: 'sessions' }
  | { kind: 'switch'; target: string }
  | { kind: 'current' }
  | { kind: 'stop' }
  | { kind: 'bind'; code: string }
  | { kind: 'help' }
  | { kind: 'unknown'; raw: string }
  | { kind: 'none' };

const ALIASES: Record<string, ChannelCommand['kind']> = {
  新对话: 'new',
  new: 'new',
  reset: 'new',
  会话: 'sessions',
  sessions: 'sessions',
  list: 'sessions',
  列表: 'sessions',
  切换: 'switch',
  switch: 'switch',
  current: 'current',
  当前: 'current',
  status: 'current',
  停止: 'stop',
  stop: 'stop',
  绑定: 'bind',
  bind: 'bind',
  帮助: 'help',
  help: 'help',
  '?': 'help',
};

/** 全角斜杠与全角空格归一，避免用户用中文输入法打不出来 */
function normalize(input: string): string {
  return input
    .replace(/^[\s\u3000]+/, '')
    .replace(/^\uFF0F/, '/') // ／
    .replace(/\u3000/g, ' ');
}

/**
 * 解析一条入站文本。
 * 只有以 `/` 开头且第一段命中别名才算命令；其余一律 none（正常对话）。
 */
export function parseCommand(raw: string): ChannelCommand {
  const text = normalize(raw);
  if (!text.startsWith('/')) return { kind: 'none' };

  const body = text.slice(1).trim();
  if (body === '') return { kind: 'unknown', raw: text };

  const [head = '', ...rest] = body.split(/\s+/);
  const kind = ALIASES[head] ?? ALIASES[head.toLowerCase()];
  if (!kind) return { kind: 'unknown', raw: text };

  if (kind === 'switch') {
    const target = rest.join('').trim();
    // 缺参数时退化到列表，比报错更友好
    return target ? { kind: 'switch', target } : { kind: 'sessions' };
  }
  if (kind === 'bind') {
    const code = rest.join('').trim();
    return { kind: 'bind', code };
  }
  return { kind } as ChannelCommand;
}

/** 帮助文案（各渠道共用；渠道名由调用方注入） */
export function helpText(channelName: string): string {
  return [
    `我是你的 AI 助手（来自 ${channelName}）。直接发消息即可对话，上下文会一直延续。`,
    '',
    '可用命令：',
    '/新对话 — 开一个新会话（旧会话仍可用 /切换 找回）',
    '/会话 — 查看最近 5 个会话',
    '/切换 <编号> 或 /切换 #短ID — 切到某个历史会话',
    '/当前 — 查看当前会话信息',
    '/停止 — 中断正在生成的回复',
    '/绑定 <6位码> — 绑定你的账号（首次使用需先绑定）',
    '/帮助 — 显示本说明',
  ].join('\n');
}

export function unknownCommandText(raw: string): string {
  return `未知命令：${raw}\n发送 /帮助 查看可用命令。`;
}
