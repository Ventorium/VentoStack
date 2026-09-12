import type { AuthUser, SessionManager } from '@ventostack/auth';
import { fail } from '@ventostack/core';
import type { Middleware } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { RoleModel, UserRoleModel } from '../models/role';
import { UserModel } from '../models/user';

/**
 * 在 JWT 验签后核对服务端会话、账号状态和实时角色。
 * 这使停用、拉黑、角色变更和 forceLogout 对已有 access token 立即生效。
 */
export function createLiveSystemAuthMiddleware(deps: {
  tokenAuthMiddleware: Middleware;
  sessionManager: SessionManager;
  db: Database;
}): Middleware {
  return async (ctx, next) =>
    deps.tokenAuthMiddleware(ctx, async () => {
      const tokenUser = ctx.user as AuthUser | undefined;
      if (!tokenUser?.id || !tokenUser.sessionId) return fail('无效的认证会话', 401, 401);

      const [session, principal, links] = await Promise.all([
        deps.sessionManager.get(tokenUser.sessionId),
        deps.db
          .query(UserModel)
          .where('id', '=', tokenUser.id)
          .select('status', 'blacklisted')
          .get(),
        deps.db.query(UserRoleModel).where('user_id', '=', tokenUser.id).select('role_id').list(),
      ]);
      if (
        !session ||
        session.data.userId !== tokenUser.id ||
        !principal ||
        principal.status !== 1 ||
        principal.blacklisted
      ) {
        return fail('认证会话已失效', 401, 401);
      }

      const roles = links.length
        ? await deps.db
            .query(RoleModel)
            .where(
              'id',
              'IN',
              links.map((link) => link.role_id),
            )
            .where('status', '=', 1)
            .select('code')
            .list()
        : [];
      tokenUser.roles = roles.map((role) => role.code);
      return next();
    });
}
