/**
 * @ventostack/system - 登录失败计数与账号锁定策略
 *
 * 锁定策略（缓存键、剩余时间换算、锁定错误）同时被登录服务与「用户解锁」路由消费，
 * 因此独立成文件，避免继续膨胀 services/auth.ts，也让解锁逻辑无需依赖整个认证服务。
 */

/** 账号锁定的业务错误码（对外契约，前端据此做差异化提示） */
export const ACCOUNT_LOCKED_CODE = 'account_locked';

/** 账号锁定默认 HTTP 状态码 */
const ACCOUNT_LOCKED_STATUS = 401;

/**
 * 登录失败计数缓存键
 *
 * 按「租户 + 账号」作用域而非「租户 + IP + 账号」：`sys_login_max_attempts` 的配置语义是
 * 「超过此次数后锁定账户」，锁定对象必须是账号本身，否则管理端解锁无法定位到计数键
 * （解锁接口只知道账号，不知道此前登录来自哪个 IP），会出现「解锁成功但依然登录失败」。
 * 单 IP 的暴力破解仍由 login_ip 维度的限流兜底。
 */
export function loginFailKey(tenantId: string, username: string): string {
  return `tenant:${tenantId}:login_fail:${username}`;
}

/**
 * 账号锁定到期时间的缓存键（值为 epoch 毫秒）
 *
 * 与失败计数分开存放：计数键只回答「失败了几次」，锁定到期时间用于告诉用户还要等多久。
 * TTL 与计数键一致（sys_login_lock_minutes），解锁时两者必须同时清除。
 */
export function loginLockUntilKey(tenantId: string, username: string): string {
  return `tenant:${tenantId}:login_locked_until:${username}`;
}

/** 账号锁定错误：code 为业务错误码，status 为 HTTP 状态码，data 携带剩余等待分钟数 */
export interface AccountLockedError extends Error {
  code: typeof ACCOUNT_LOCKED_CODE;
  status: typeof ACCOUNT_LOCKED_STATUS;
  data: { retryAfterMinutes: number };
}

/**
 * 计算剩余锁定分钟数
 * @param lockedUntilMs 锁定到期时间（epoch 毫秒），缺失或非法时回退
 * @param fallbackMinutes 无法确定到期时间时使用的配置锁定时长
 * @returns 剩余分钟数（向上取整，至少 1；已到期返回 0）
 */
export function remainingLockMinutes(lockedUntilMs: number, fallbackMinutes: number): number {
  if (!Number.isFinite(lockedUntilMs) || lockedUntilMs <= 0) return fallbackMinutes;
  const remainingMs = lockedUntilMs - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(remainingMs / 60_000));
}

/**
 * 构造账号锁定错误
 * @param retryAfterMinutes 剩余等待分钟数
 */
export function createAccountLockedError(retryAfterMinutes: number): AccountLockedError {
  const err = new Error('账号登录失败次数过多，已锁定') as AccountLockedError;
  err.code = ACCOUNT_LOCKED_CODE;
  err.status = ACCOUNT_LOCKED_STATUS;
  err.data = { retryAfterMinutes };
  return err;
}
