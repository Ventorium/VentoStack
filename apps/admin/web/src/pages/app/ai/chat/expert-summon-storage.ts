/**
 * 召唤专家（会话级 Role Override）的本地持久化
 *
 * 专家选择按会话（conversationId）存 localStorage，用于切换会话与刷新后恢复。
 * 新对话在首条消息之前还没有会话 ID，此时只有内存态；等后端在流开头下发
 * sessionId（或上传附件创建会话）后，再由调用方写入该会话的键。
 *
 * 注意：会话 ID 刚出现时不能按「切换会话」去读存储——新建会话在存储里必然没有值，
 * 读出来会把用户刚召唤的专家清空（问答后选中效果丢失的根因）。
 */
import type { SummonedExpert } from './components/ExpertSummon';

const STORAGE_KEY_PREFIX = 'expert-summon:';

/** 最小存储契约：与 localStorage 兼容，便于无浏览器环境注入假实现做单测 */
export interface ExpertSummonStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 会话对应的存储键（会话 ID 由后端生成，不含用户输入，可直接拼键） */
export function summonedExpertStorageKey(sessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 反序列化存储值：结构非法（脏数据、旧格式、被篡改）一律视为未召唤；
 * 只保留 id/name/slug 白名单字段，避免未知字段流进内存态。
 */
export function parseSummonedExpert(raw: string | null): SummonedExpert | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { id, name, slug } = parsed as Record<string, unknown>;
  if (!isNonEmptyString(id) || !isNonEmptyString(name)) return null;
  return { id, name, ...(isNonEmptyString(slug) ? { slug } : {}) };
}

// 无浏览器环境（bun test / SSR）没有 localStorage：降级为无持久化，仅内存态生效
function resolveStorage(): ExpertSummonStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

/** 读取会话的召唤态；存储不可用或数据非法时返回 null（视为未召唤） */
export function readSummonedExpert(
  sessionId: string,
  storage: ExpertSummonStorage | null = resolveStorage(),
): SummonedExpert | null {
  if (!storage) return null;
  try {
    return parseSummonedExpert(storage.getItem(summonedExpertStorageKey(sessionId)));
  } catch {
    return null;
  }
}

/** 写入/清除会话的召唤态；存储不可用（隐私模式、配额满）时静默降级，不影响对话 */
export function writeSummonedExpert(
  sessionId: string,
  expert: SummonedExpert | null,
  storage: ExpertSummonStorage | null = resolveStorage(),
): void {
  if (!storage) return;
  try {
    const key = summonedExpertStorageKey(sessionId);
    if (expert) storage.setItem(key, JSON.stringify(expert));
    else storage.removeItem(key);
  } catch {
    /* 存储不可用时仅内存态生效 */
  }
}
