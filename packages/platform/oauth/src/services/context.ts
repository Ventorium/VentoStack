import type { Database } from '@ventostack/database';
import { OAuthProtocolError } from './authorization';
import type { OAuthTokenSigner } from './token-signer';

interface MenuRow {
  id: string;
  parent_id: string | null;
  name: string;
  path: string | null;
  component: string | null;
  redirect: string | null;
  type: number;
  permission: string | null;
  icon: string | null;
  sort: number;
  visible: boolean;
  children?: MenuRow[];
}

interface ActiveContext {
  claims: Record<string, unknown>;
  scope: Set<string>;
  row: {
    id: string;
    username: string;
    nickname: string | null;
    avatar: string | null;
    dept_id: string | null;
    application_id: string;
    identifier: string;
    application_name: string;
    icon_url: string | null;
    backend_session_id: string;
  };
}

function tree(rows: MenuRow[]): MenuRow[] {
  const nodes = new Map(rows.map((row) => [row.id, { ...row, children: [] as MenuRow[] }]));
  const roots: MenuRow[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children!.push(node);
    else roots.push(node);
  }
  const sort = (items: MenuRow[]): MenuRow[] =>
    items
      .sort((a, b) => a.sort - b.sort)
      .map((item) => ({ ...item, children: sort(item.children ?? []) }));
  return sort(roots);
}

export function createOAuthContextService(deps: {
  db: Database;
  signer: OAuthTokenSigner;
  issuer: string;
  audience: string;
  isBackendSessionActive: (sessionId: string, userId: string) => Promise<boolean>;
}) {
  async function resolve(accessToken: string): Promise<ActiveContext> {
    let claims: Record<string, unknown>;
    try {
      claims = await deps.signer.verify(accessToken, {
        issuer: deps.issuer.replace(/\/$/, ''),
        audience: deps.audience,
        typ: 'at+jwt',
      });
    } catch {
      throw new OAuthProtocolError('invalid_token', 'Access Token 无效', 401);
    }
    const sub = typeof claims.sub === 'string' ? claims.sub : '';
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : '';
    const tenantId = typeof claims.tenant_id === 'string' ? claims.tenant_id : '';
    const jti = typeof claims.jti === 'string' ? claims.jti : '';
    const sid = typeof claims.sid === 'string' ? claims.sid : '';
    const scope = new Set(typeof claims.scope === 'string' ? claims.scope.split(' ') : []);
    const active = (await deps.db.raw(
      `SELECT u.id,u.username,u.nickname,u.avatar,u.dept_id,ss.backend_session_id,
              a.id application_id,a.identifier,a.name application_name,a.icon_url
       FROM oauth_access_token t
       JOIN oauth_client_session cs ON cs.id=t.client_session_id AND cs.sid=$5 AND cs.revoked_at IS NULL
       JOIN oauth_sso_session ss ON ss.id=cs.sso_session_id AND ss.revoked_at IS NULL AND ss.absolute_expires_at>NOW()
       JOIN oauth_application a ON a.id=t.application_id AND a.client_id=$2 AND a.enabled=TRUE AND a.status='ACTIVE'
       JOIN sys_user u ON u.tenant_id=t.tenant_id AND u.id=t.user_id AND u.status=1 AND u.blacklisted=FALSE AND u.deleted_at IS NULL
       WHERE t.jti=$1 AND t.user_id=$3 AND t.tenant_id=$4 AND t.revoked_at IS NULL AND t.expires_at>NOW()
         AND (u.password_changed_at IS NULL OR ss.auth_time>=u.password_changed_at) LIMIT 1`,
      [jti, clientId, sub, tenantId, sid],
    )) as ActiveContext['row'][];
    const row = active[0];
    if (!row) throw new OAuthProtocolError('invalid_token', 'Access Token 已失效', 401);
    if (!(await deps.isBackendSessionActive(row.backend_session_id, row.id)))
      throw new OAuthProtocolError('invalid_token', '中心 Session 已失效', 401);
    return { claims, scope, row };
  }
  return {
    async userInfo(accessToken: string): Promise<Record<string, unknown>> {
      const { claims, scope, row } = await resolve(accessToken);
      const result: Record<string, unknown> = { sub: claims.sub };
      if (scope.has('profile')) {
        result.preferred_username = row.username;
        result.name = row.nickname ?? row.username;
        if (row.avatar) result.picture = row.avatar;
      }
      return result;
    },
    async get(accessToken: string): Promise<Record<string, unknown>> {
      const { claims, scope, row } = await resolve(accessToken);
      const sub = typeof claims.sub === 'string' ? claims.sub : '';
      const tenantId = typeof claims.tenant_id === 'string' ? claims.tenant_id : '';
      if (!scope.has('context'))
        throw new OAuthProtocolError('insufficient_scope', '缺少 context Scope', 403);
      const result: Record<string, unknown> = {
        user: {
          id: row.id,
          username: row.username,
          displayName: row.nickname ?? row.username,
          avatar: row.avatar,
        },
        application: { id: row.identifier, name: row.application_name, icon: row.icon_url },
      };
      const roleRows =
        scope.has('roles.read') || scope.has('menus.read') || scope.has('permissions.read')
          ? ((await deps.db.raw(
              `SELECT r.id,r.name,r.code FROM sys_role r JOIN sys_user_role ur ON ur.tenant_id=r.tenant_id AND ur.role_id=r.id
             WHERE r.tenant_id=$1 AND ur.user_id=$2 AND r.status=1 AND r.deleted_at IS NULL`,
              [tenantId, sub],
            )) as Array<{ id: string; name: string; code: string }>)
          : [];
      if (scope.has('roles.read')) result.roles = roleRows;
      if (scope.has('departments.read')) {
        result.departments = row.dept_id
          ? await deps.db.raw(
              `WITH RECURSIVE chain AS (SELECT id,parent_id,name FROM sys_dept WHERE tenant_id=$1 AND id=$2 AND status=1 AND deleted_at IS NULL
           UNION ALL SELECT d.id,d.parent_id,d.name FROM sys_dept d JOIN chain c ON c.parent_id=d.id WHERE d.tenant_id=$1 AND d.status=1 AND d.deleted_at IS NULL)
           SELECT id,name FROM chain`,
              [tenantId, row.dept_id],
            )
          : [];
      }
      if (scope.has('menus.read') || scope.has('permissions.read')) {
        const roleIds = roleRows.map((role) => role.id);
        const menus = roleIds.length
          ? ((await deps.db.raw(
              `SELECT DISTINCT m.id,m.parent_id,m.name,m.path,m.component,m.redirect,m.type,m.permission,m.icon,m.sort,m.visible
           FROM sys_menu m JOIN sys_role_menu rm ON rm.tenant_id=m.tenant_id AND rm.menu_id=m.id
           WHERE m.tenant_id=$1 AND m.application_id=$2 AND rm.role_id IN (${roleIds.map((_, index) => `$${index + 3}`).join(', ')}) AND m.status=1
           ORDER BY m.sort`,
              [tenantId, row.application_id, ...roleIds],
            )) as MenuRow[])
          : [];
        if (scope.has('menus.read')) result.menus = tree(menus);
        if (scope.has('permissions.read'))
          result.permissions = [...new Set(menus.map((menu) => menu.permission).filter(Boolean))];
      }
      return result;
    },
  };
}

export type OAuthContextService = ReturnType<typeof createOAuthContextService>;
