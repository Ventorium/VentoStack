import { generateUUID } from '@ventostack/core';
import type { Seed } from '@ventostack/database';
import { env } from '../../config';

export const addOAuthMenusSeed: Seed = {
  name: '012_oauth_menus',
  async run(executor) {
    if (!env.OAUTH_ENABLED) return;
    const tenantId = env.TENANT_ID;
    const roles = (await executor(
      "SELECT id FROM sys_role WHERE tenant_id=$1 AND code='admin' AND status=1",
      [tenantId],
    )) as Array<{ id: string }>;
    const adminRoleId = roles[0]?.id;
    const addRoleMenu = async (menuId: string) => {
      if (adminRoleId)
        await executor(
          'INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [tenantId, adminRoleId, menuId],
        );
    };
    const existing = (await executor(
      "SELECT id FROM sys_menu WHERE tenant_id=$1 AND application_id IS NULL AND path='/app/oauth' LIMIT 1",
      [tenantId],
    )) as Array<{ id: string }>;
    let directoryId = existing[0]?.id;
    if (!directoryId) {
      directoryId = generateUUID();
      await executor(
        `INSERT INTO sys_menu
         (id,tenant_id,application_id,parent_id,name,path,type,permission,icon,sort,visible,status,created_at,updated_at)
         VALUES ($1,$2,NULL,NULL,'认证中心','/app/oauth',1,NULL,'SafetyCertificateOutlined',50,TRUE,1,NOW(),NOW())`,
        [directoryId, tenantId],
      );
      await addRoleMenu(directoryId);
    }
    const applicationPage = (await executor(
      "SELECT id FROM sys_menu WHERE tenant_id=$1 AND application_id IS NULL AND path='/app/oauth/applications' LIMIT 1",
      [tenantId],
    )) as Array<{ id: string }>;
    let applicationPageId = applicationPage[0]?.id;
    if (!applicationPageId) {
      applicationPageId = generateUUID();
      await executor(
        `INSERT INTO sys_menu
         (id,tenant_id,application_id,parent_id,name,path,type,permission,icon,sort,visible,status,created_at,updated_at)
         VALUES ($1,$2,NULL,$3,'应用管理','/app/oauth/applications',2,'oauth:application:list','AppstoreOutlined',1,TRUE,1,NOW(),NOW())`,
        [applicationPageId, tenantId, directoryId],
      );
      await addRoleMenu(applicationPageId);
    }
    const actions = [
      'oauth:application:query',
      'oauth:application:create',
      'oauth:application:update',
      'oauth:application:secret',
      'oauth:application:delete',
      'oauth:grant:query',
      'oauth:grant:update',
      'oauth:log:list',
      'oauth:menu:list',
      'oauth:menu:create',
      'oauth:menu:update',
      'oauth:menu:delete',
    ];
    for (const [index, permission] of actions.entries()) {
      const found = await executor(
        'SELECT id FROM sys_menu WHERE tenant_id=$1 AND application_id IS NULL AND permission=$2 LIMIT 1',
        [tenantId, permission],
      );
      if ((found as unknown[]).length) continue;
      const id = generateUUID();
      await executor(
        `INSERT INTO sys_menu
         (id,tenant_id,application_id,parent_id,name,path,type,permission,sort,visible,status,created_at,updated_at)
         VALUES ($1,$2,NULL,$3,$4,'',3,$5,$6,TRUE,1,NOW(),NOW())`,
        [id, tenantId, applicationPageId, permission, permission, index + 1],
      );
      await addRoleMenu(id);
    }
    const portal = (await executor(
      "SELECT id FROM sys_menu WHERE tenant_id=$1 AND application_id IS NULL AND path='/app/portal' LIMIT 1",
      [tenantId],
    )) as Array<{ id: string }>;
    if (portal.length > 0) {
      await executor(
        'UPDATE sys_menu SET parent_id=$2, updated_at=NOW() WHERE id=$1',
        [portal[0]!.id, directoryId],
      );
    } else {
      const id = generateUUID();
      await executor(
        `INSERT INTO sys_menu
         (id,tenant_id,application_id,parent_id,name,path,type,permission,icon,sort,visible,status,created_at,updated_at)
         VALUES ($1,$2,NULL,$3,'应用门户','/app/portal',2,NULL,'AppstoreOutlined',2,TRUE,1,NOW(),NOW())`,
        [id, tenantId, directoryId],
      );
      await addRoleMenu(id);
    }
  },
};
