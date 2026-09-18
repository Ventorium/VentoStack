import type { AuthUser } from '@ventostack/auth';
import { VentoStackError } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import {
  OAuthApplicationDeptGrantModel,
  OAuthApplicationModel,
  OAuthApplicationRoleGrantModel,
  OAuthApplicationUserGrantModel,
} from '../models';

export interface DepartmentGrantInput {
  deptId: string;
  scope: 'SELF' | 'SELF_AND_DESCENDANTS';
}

export interface ApplicationGrants {
  roleIds: string[];
  userIds: string[];
  departments: DepartmentGrantInput[];
}

export interface PortalApplication {
  id: string;
  identifier: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  homepageUrl: string;
  sort: number;
}

export class OAuthGrantError extends VentoStackError {
  constructor(message: string, status = 400, code = 'OAUTH_GRANT_INVALID') {
    super(message, status, code);
    this.name = 'OAuthGrantError';
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function createOAuthGrantService(deps: { db: Database; tenantId: string }) {
  const { db, tenantId } = deps;

  async function assertApplication(applicationId: string): Promise<void> {
    const app = await db
      .query(OAuthApplicationModel)
      .where('id', '=', applicationId)
      .where('status', 'IN', ['ACTIVE', 'DISABLED'])
      .select('id')
      .get();
    if (!app) throw new OAuthGrantError('Application 不存在', 404, 'OAUTH_APPLICATION_NOT_FOUND');
  }

  async function validateSubjects(table: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const placeholders = ids.map((_, index) => `$${index + 2}`).join(', ');
    const rows = (await db.raw(
      `SELECT id FROM ${table} WHERE tenant_id = $1 AND id IN (${placeholders}) AND status = 1 AND deleted_at IS NULL`,
      [tenantId, ...ids],
    )) as Array<{ id: string }>;
    if (rows.length !== ids.length)
      throw new OAuthGrantError('授权主体不存在、已停用或不属于当前租户');
  }

  return {
    async get(applicationId: string): Promise<ApplicationGrants> {
      await assertApplication(applicationId);
      const [roles, users, departments] = await Promise.all([
        db
          .query(OAuthApplicationRoleGrantModel)
          .where('tenant_id', '=', tenantId)
          .where('application_id', '=', applicationId)
          .select('role_id')
          .list(),
        db
          .query(OAuthApplicationUserGrantModel)
          .where('tenant_id', '=', tenantId)
          .where('application_id', '=', applicationId)
          .select('user_id')
          .list(),
        db
          .query(OAuthApplicationDeptGrantModel)
          .where('tenant_id', '=', tenantId)
          .where('application_id', '=', applicationId)
          .select('dept_id', 'scope')
          .list(),
      ]);
      return {
        roleIds: roles.map((row) => row.role_id),
        userIds: users.map((row) => row.user_id),
        departments: departments.map((row) => ({
          deptId: row.dept_id,
          scope: row.scope as DepartmentGrantInput['scope'],
        })),
      };
    },

    async replace(applicationId: string, input: ApplicationGrants): Promise<void> {
      const roleIds = unique(input.roleIds);
      const userIds = unique(input.userIds);
      const departments = [
        ...new Map(input.departments.map((item) => [item.deptId, item])).values(),
      ];
      if (roleIds.length > 100 || userIds.length > 100 || departments.length > 100)
        throw new OAuthGrantError('每类授权主体不能超过 100 个');
      await assertApplication(applicationId);
      await Promise.all([
        validateSubjects('sys_role', roleIds),
        validateSubjects('sys_user', userIds),
        validateSubjects(
          'sys_dept',
          departments.map((item) => item.deptId),
        ),
      ]);
      await db.transaction(async (tx) => {
        await tx
          .query(OAuthApplicationRoleGrantModel)
          .where('tenant_id', '=', tenantId)
          .where('application_id', '=', applicationId)
          .delete();
        await tx
          .query(OAuthApplicationUserGrantModel)
          .where('tenant_id', '=', tenantId)
          .where('application_id', '=', applicationId)
          .delete();
        await tx
          .query(OAuthApplicationDeptGrantModel)
          .where('tenant_id', '=', tenantId)
          .where('application_id', '=', applicationId)
          .delete();
        if (roleIds.length)
          await tx.query(OAuthApplicationRoleGrantModel).batchInsert(
            roleIds.map((roleId) => ({
              tenant_id: tenantId,
              application_id: applicationId,
              role_id: roleId,
            })),
          );
        if (userIds.length)
          await tx.query(OAuthApplicationUserGrantModel).batchInsert(
            userIds.map((userId) => ({
              tenant_id: tenantId,
              application_id: applicationId,
              user_id: userId,
            })),
          );
        if (departments.length)
          await tx.query(OAuthApplicationDeptGrantModel).batchInsert(
            departments.map((item) => ({
              tenant_id: tenantId,
              application_id: applicationId,
              dept_id: item.deptId,
              scope: item.scope,
            })),
          );
      });
    },

    async canAccess(applicationId: string, user: AuthUser): Promise<boolean> {
      const rows = (await db.raw(
        `WITH RECURSIVE user_dept AS (
           SELECT d.id, d.parent_id FROM sys_user u JOIN sys_dept d ON d.tenant_id=u.tenant_id AND d.id=u.dept_id
           WHERE u.tenant_id=$1 AND u.id=$2 AND u.status=1 AND u.deleted_at IS NULL
           UNION ALL SELECT d.id, d.parent_id FROM sys_dept d JOIN user_dept c ON c.parent_id=d.id
           WHERE d.tenant_id=$1 AND d.status=1 AND d.deleted_at IS NULL
         ) SELECT 1 FROM oauth_application a WHERE a.id=$3 AND a.enabled=TRUE AND a.status='ACTIVE' AND (
           EXISTS (SELECT 1 FROM oauth_application_user_grant g WHERE g.tenant_id=$1 AND g.application_id=a.id AND g.user_id=$2)
           OR EXISTS (SELECT 1 FROM oauth_application_role_grant g JOIN sys_user_role ur ON ur.tenant_id=g.tenant_id AND ur.role_id=g.role_id WHERE g.tenant_id=$1 AND g.application_id=a.id AND ur.user_id=$2)
           OR EXISTS (SELECT 1 FROM oauth_application_dept_grant g JOIN user_dept d ON d.id=g.dept_id WHERE g.tenant_id=$1 AND g.application_id=a.id AND (g.scope='SELF_AND_DESCENDANTS' OR g.dept_id=(SELECT dept_id FROM sys_user WHERE tenant_id=$1 AND id=$2)))
         ) LIMIT 1`,
        [tenantId, user.id, applicationId],
      )) as unknown[];
      return rows.length > 0;
    },

    async portal(user: AuthUser, search?: string): Promise<PortalApplication[]> {
      const rows = (await db.raw(
        `SELECT DISTINCT a.id,a.identifier,a.name,a.description,a.icon_url,a.homepage_url,a.sort
         FROM oauth_application a
         WHERE a.enabled=TRUE AND a.status='ACTIVE' AND ($3='' OR a.name ILIKE $3)
         AND (EXISTS (SELECT 1 FROM oauth_application_user_grant g WHERE g.tenant_id=$1 AND g.application_id=a.id AND g.user_id=$2)
           OR EXISTS (SELECT 1 FROM oauth_application_role_grant g JOIN sys_user_role ur ON ur.tenant_id=g.tenant_id AND ur.role_id=g.role_id WHERE g.tenant_id=$1 AND g.application_id=a.id AND ur.user_id=$2)
           OR EXISTS (SELECT 1 FROM oauth_application_dept_grant g JOIN sys_user u ON u.tenant_id=g.tenant_id AND u.id=$2 WHERE g.tenant_id=$1 AND g.application_id=a.id AND (g.dept_id=u.dept_id OR (g.scope='SELF_AND_DESCENDANTS' AND EXISTS (WITH RECURSIVE tree AS (SELECT id FROM sys_dept WHERE tenant_id=$1 AND id=g.dept_id UNION ALL SELECT d.id FROM sys_dept d JOIN tree t ON d.parent_id=t.id WHERE d.tenant_id=$1) SELECT 1 FROM tree WHERE id=u.dept_id))))
         ) ORDER BY a.sort ASC,a.name ASC`,
        [tenantId, user.id, search ? `%${search}%` : ''],
      )) as Array<{
        id: string;
        identifier: string;
        name: string;
        description: string | null;
        icon_url: string | null;
        homepage_url: string;
        sort: number;
      }>;
      return rows.map((row) => ({
        id: row.id,
        identifier: row.identifier,
        name: row.name,
        description: row.description,
        iconUrl: row.icon_url,
        homepageUrl: row.homepage_url,
        sort: row.sort,
      }));
    },
  };
}

export type OAuthGrantService = ReturnType<typeof createOAuthGrantService>;
