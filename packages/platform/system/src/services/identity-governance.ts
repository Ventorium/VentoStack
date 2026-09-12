import type { AuthUser } from '@ventostack/auth';
import { VentoStackError, fail } from '@ventostack/core';
import type { Middleware } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import { RoleModel, UserRoleModel } from '../models/role';

export interface IdentityGovernanceService {
  isActiveAdmin(userId: string): Promise<boolean>;
  assertActiveAdmin(user: AuthUser): Promise<void>;
  assertCanAssignRoles(user: AuthUser, roleIds: string[]): Promise<void>;
  adminOnlyMiddleware: Middleware;
}

export class IdentityGovernanceError extends VentoStackError {
  constructor(message: string) {
    super(message, 403, 'IDENTITY_GRANT_FORBIDDEN');
    this.name = 'IdentityGovernanceError';
  }
}

/** 授权控制面策略。admin 身份始终从数据库实时确认，不信任 JWT 声明。 */
export function createIdentityGovernanceService(db: Database): IdentityGovernanceService {
  async function getActiveRoleIds(userId: string): Promise<string[]> {
    const links = await db
      .query(UserRoleModel)
      .where('user_id', '=', userId)
      .select('role_id')
      .list();
    if (links.length === 0) return [];
    const roles = await db
      .query(RoleModel)
      .where(
        'id',
        'IN',
        links.map((link) => link.role_id),
      )
      .where('status', '=', 1)
      .select('id')
      .list();
    return roles.map((role) => role.id);
  }

  async function isActiveAdmin(userId: string): Promise<boolean> {
    const links = await db
      .query(UserRoleModel)
      .where('user_id', '=', userId)
      .select('role_id')
      .list();
    if (links.length === 0) return false;
    const role = await db
      .query(RoleModel)
      .where(
        'id',
        'IN',
        links.map((link) => link.role_id),
      )
      .where('status', '=', 1)
      .where('code', '=', 'admin')
      .select('id')
      .get();
    return role !== null;
  }

  async function assertActiveAdmin(user: AuthUser): Promise<void> {
    if (!(await isActiveAdmin(user.id)))
      throw new IdentityGovernanceError('仅超级管理员可执行该操作');
  }

  async function assertCanAssignRoles(user: AuthUser, roleIds: string[]): Promise<void> {
    const normalized = [...new Set(roleIds)];
    if (normalized.length > 100) throw new Error('角色数量不能超过 100');
    if (normalized.length === 0 || (await isActiveAdmin(user.id))) return;
    const actorRoleIds = new Set(await getActiveRoleIds(user.id));
    if (normalized.some((roleId) => !actorRoleIds.has(roleId))) {
      throw new IdentityGovernanceError('不能授予自身未持有的角色');
    }
  }

  const adminOnlyMiddleware: Middleware = async (ctx, next) => {
    const user = ctx.user as AuthUser | undefined;
    if (!user) return fail('未登录或登录已过期', 401, 401);
    if (!(await isActiveAdmin(user.id))) return fail('仅超级管理员可执行该操作', 403, 403);
    return next();
  };

  return { isActiveAdmin, assertActiveAdmin, assertCanAssignRoles, adminOnlyMiddleware };
}
