import type { Database } from '@ventostack/database';
import { MenuModel, RoleMenuModel, RoleModel } from '@ventostack/system';
import { OAuthApplicationModel } from '../models';
import { OAuthGrantError } from './grants';

export interface ApplicationMenuInput {
  parentId?: string | null;
  name: string;
  path?: string | null;
  component?: string | null;
  redirect?: string | null;
  type: number;
  permission?: string | null;
  icon?: string | null;
  sort: number;
  visible: boolean;
  status: number;
  roleIds: string[];
}

interface MenuRow extends Record<string, unknown> {
  id: string;
  parent_id: string | null;
  children?: MenuRow[];
  role_ids?: string[];
}

function buildTree(rows: MenuRow[]): MenuRow[] {
  const nodes = new Map(rows.map((row) => [row.id, { ...row, children: [] as MenuRow[] }]));
  const roots: MenuRow[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children!.push(node);
    else roots.push(node);
  }
  return roots;
}

export function createOAuthApplicationMenuService(deps: { db: Database; tenantId: string }) {
  const { db, tenantId } = deps;
  async function assertApplication(applicationId: string): Promise<void> {
    const row = await db
      .query(OAuthApplicationModel)
      .where('id', '=', applicationId)
      .where('status', '!=', 'DELETED')
      .select('id')
      .get();
    if (!row) throw new OAuthGrantError('Application 不存在', 404, 'OAUTH_APPLICATION_NOT_FOUND');
  }
  async function validate(input: ApplicationMenuInput, applicationId: string, selfId?: string) {
    if (input.parentId) {
      if (input.parentId === selfId) throw new OAuthGrantError('菜单不能以自己为父级');
      const parent = await db
        .query(MenuModel)
        .where('tenant_id', '=', tenantId)
        .where('application_id', '=', applicationId)
        .where('id', '=', input.parentId)
        .select('id')
        .get();
      if (!parent) throw new OAuthGrantError('父菜单不存在或不属于当前 Application');
    }
    const roleIds = [...new Set(input.roleIds)];
    if (roleIds.length > 100) throw new OAuthGrantError('角色数量不能超过 100');
    if (roleIds.length) {
      const roles = await db
        .query(RoleModel)
        .where('tenant_id', '=', tenantId)
        .where('id', 'IN', roleIds)
        .where('status', '=', 1)
        .select('id')
        .list();
      if (roles.length !== roleIds.length) throw new OAuthGrantError('包含无效或跨租户角色');
    }
    return roleIds;
  }
  return {
    async list(applicationId: string): Promise<MenuRow[]> {
      await assertApplication(applicationId);
      const rows = (await db
        .query(MenuModel)
        .where('tenant_id', '=', tenantId)
        .where('application_id', '=', applicationId)
        .orderBy('sort', 'asc')
        .list()) as unknown as MenuRow[];
      const ids = rows.map((row) => row.id);
      const links = ids.length
        ? await db
            .query(RoleMenuModel)
            .where('tenant_id', '=', tenantId)
            .where('menu_id', 'IN', ids)
            .select('menu_id', 'role_id')
            .list()
        : [];
      const roles = new Map<string, string[]>();
      for (const link of links)
        roles.set(link.menu_id, [...(roles.get(link.menu_id) ?? []), link.role_id]);
      return buildTree(rows.map((row) => ({ ...row, role_ids: roles.get(row.id) ?? [] })));
    },
    async create(applicationId: string, input: ApplicationMenuInput): Promise<{ id: string }> {
      await assertApplication(applicationId);
      const roleIds = await validate(input, applicationId);
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.query(MenuModel).insert({
          id,
          tenant_id: tenantId,
          application_id: applicationId,
          parent_id: input.parentId ?? null,
          name: input.name,
          path: input.path ?? null,
          component: input.component ?? null,
          redirect: input.redirect ?? null,
          type: input.type,
          permission: input.permission ?? null,
          icon: input.icon ?? null,
          sort: input.sort,
          visible: input.visible,
          status: input.status,
        });
        if (roleIds.length)
          await tx
            .query(RoleMenuModel)
            .batchInsert(
              roleIds.map((roleId) => ({ tenant_id: tenantId, role_id: roleId, menu_id: id })),
            );
      });
      return { id };
    },
    async update(applicationId: string, id: string, input: ApplicationMenuInput): Promise<void> {
      const current = await db
        .query(MenuModel)
        .where('tenant_id', '=', tenantId)
        .where('application_id', '=', applicationId)
        .where('id', '=', id)
        .select('id')
        .get();
      if (!current) throw new OAuthGrantError('菜单不存在', 404, 'OAUTH_MENU_NOT_FOUND');
      const roleIds = await validate(input, applicationId, id);
      await db.transaction(async (tx) => {
        await tx
          .query(MenuModel)
          .where('tenant_id', '=', tenantId)
          .where('application_id', '=', applicationId)
          .where('id', '=', id)
          .update({
            parent_id: input.parentId ?? null,
            name: input.name,
            path: input.path ?? null,
            component: input.component ?? null,
            redirect: input.redirect ?? null,
            type: input.type,
            permission: input.permission ?? null,
            icon: input.icon ?? null,
            sort: input.sort,
            visible: input.visible,
            status: input.status,
          });
        await tx
          .query(RoleMenuModel)
          .where('tenant_id', '=', tenantId)
          .where('menu_id', '=', id)
          .hardDelete();
        if (roleIds.length)
          await tx
            .query(RoleMenuModel)
            .batchInsert(
              roleIds.map((roleId) => ({ tenant_id: tenantId, role_id: roleId, menu_id: id })),
            );
      });
    },
    async delete(applicationId: string, id: string): Promise<void> {
      const current = await db
        .query(MenuModel)
        .where('tenant_id', '=', tenantId)
        .where('application_id', '=', applicationId)
        .where('id', '=', id)
        .select('id')
        .get();
      if (!current) throw new OAuthGrantError('菜单不存在', 404, 'OAUTH_MENU_NOT_FOUND');
      const children = await db
        .query(MenuModel)
        .where('tenant_id', '=', tenantId)
        .where('application_id', '=', applicationId)
        .where('parent_id', '=', id)
        .count();
      if (children) throw new OAuthGrantError('菜单存在子菜单，不能删除');
      await db.transaction(async (tx) => {
        await tx
          .query(RoleMenuModel)
          .where('tenant_id', '=', tenantId)
          .where('menu_id', '=', id)
          .hardDelete();
        await tx
          .query(MenuModel)
          .where('tenant_id', '=', tenantId)
          .where('application_id', '=', applicationId)
          .where('id', '=', id)
          .hardDelete();
      });
    },
  };
}

export type OAuthApplicationMenuService = ReturnType<typeof createOAuthApplicationMenuService>;
