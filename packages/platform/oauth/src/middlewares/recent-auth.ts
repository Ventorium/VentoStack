import type { AuthUser, SessionManager } from '@ventostack/auth';
import { fail } from '@ventostack/core';
import type { Middleware } from '@ventostack/core';

const DEFAULT_MAX_AGE_MS = 10 * 60_000;

export function createRecentAuthenticationMiddleware(
  sessionManager: SessionManager,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): Middleware {
  return async (ctx, next) => {
    const user = ctx.user as AuthUser | undefined;
    if (!user?.sessionId) return fail('需要重新登录后执行此操作', 401, 401);
    const session = await sessionManager.get(user.sessionId);
    const authenticatedAt = session?.data.authenticatedAt;
    if (
      session?.data.userId !== user.id ||
      typeof authenticatedAt !== 'number' ||
      Date.now() - authenticatedAt > maxAgeMs
    ) {
      return fail('该操作需要近期重新认证，请重新登录后再试', 403, 403);
    }
    return next();
  };
}
