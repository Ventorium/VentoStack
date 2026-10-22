/**
 * 文本处理：出站分片、敏感脱敏、@ 剥离
 *
 * 三个函数都是纯函数，全部有单测覆盖（见 shared.test.ts）。
 */

/** 敏感模式：命中即打码。宁可多打码，不可漏发凭证到 IM。 */
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replace: string }> = [
  // OpenAI / Anthropic / 通用 sk- 前缀密钥
  { pattern: /\bsk-[A-Za-z0-9_-]{12,}/g, replace: 'sk-***' },
  // AWS Access Key
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replace: 'AKIA***' },
  // GitHub / GitLab token
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, replace: 'gh***' },
  // Bearer token
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{16,}/gi, replace: 'Bearer ***' },
  // 手机号（中国大陆）
  { pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g, replace: '138****0000' },
  // 身份证号（18 位，末位可为 X）
  {
    pattern:
      /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g,
    replace: '***身份证已打码***',
  },
];

/** 超长连续 base64/hex（>= 64 字符）：多为误贴的密钥或证书 */
const LONG_TOKEN = /[A-Za-z0-9+/=_-]{64,}/g;

/**
 * 出站正文脱敏。
 * 这是「模型生成内容」的最后一道兜底：工具描述里已约束不发凭证，
 * 但模型仍可能把上下文里的 token 复述出来。
 */
export function maskSensitive(text: string): string {
  let out = text;
  for (const { pattern, replace } of SENSITIVE_PATTERNS) {
    out = out.replace(pattern, replace);
  }
  out = out.replace(LONG_TOKEN, (match) =>
    // 纯中文/普通长单词不一定是密钥，但 64+ 的连续 base64 字符几乎一定是
    /^[A-Za-z0-9+/=_-]+$/.test(match)
      ? `${match.slice(0, 6)}***（已省略 ${match.length - 6} 字符）`
      : match,
  );
  return out;
}

/** 截断到指定长度（按码点，避免切碎 emoji） */
export function truncateText(text: string, max: number): string {
  if (max <= 0) return '';
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join('');
}

/** 分片切分点优先级：段落 > 换行 > 句末标点 > 空格 > 硬切 */
const BREAK_CANDIDATES = [
  '\n\n',
  '\n',
  '。',
  '！',
  '？',
  '；',
  '. ',
  '! ',
  '? ',
  '；',
  '，',
  ', ',
  ' ',
];

/**
 * 按上限分片，尽量在语义边界断开。
 * IM 渠道单条消息有硬上限（微信 2048、企微 2048），超长必须切，
 * 但切成半句话的体验很差，所以按优先级找断点。
 */
export function splitMessage(text: string, maxLength: number): string[] {
  const limit = Math.max(1, Math.floor(maxLength));
  const chars = Array.from(text);
  if (chars.length <= limit) return chars.length === 0 ? [] : [text];

  const parts: string[] = [];
  let rest = chars;
  while (rest.length > limit) {
    const window = rest.slice(0, limit).join('');
    let cut = -1;
    for (const sep of BREAK_CANDIDATES) {
      const index = window.lastIndexOf(sep);
      // 断点太靠前会导致碎片过多，要求至少用到 30% 容量
      if (index >= Math.floor(limit * 0.3)) {
        cut = index + Array.from(sep).length;
        break;
      }
    }
    if (cut <= 0) cut = limit;
    const piece = rest.slice(0, cut).join('').trimEnd();
    if (piece.length > 0) parts.push(piece);
    rest = rest.slice(cut);
  }
  const tail = rest.join('').trim();
  if (tail.length > 0) parts.push(tail);
  return parts;
}

/**
 * 剥离 @提及。
 * 钉钉/飞书的正文里会带 `@机器人名`，直接送模型会污染输入。
 */
export function stripMentions(text: string): string {
  return text
    .replace(/@[^\s@]{1,32}\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** 生成短 id（8 位）：/会话 列表与 /切换 用，单用户几十会话下几乎不冲突 */
export function shortId(sessionId: string): string {
  return sessionId.replace(/-/g, '').slice(0, 8);
}

/** 只保留前缀可见的脱敏展示（日志/审计/前端回显） */
export function maskId(value: string, keep = 4): string {
  if (value.length <= keep * 2) return `${value.slice(0, keep)}***`;
  return `${value.slice(0, keep)}***${value.slice(-keep)}`;
}
