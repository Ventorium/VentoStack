/**
 * @ventostack/system - 模块聚合
 * 一键创建系统管理模块，注册所有 Service、路由和中间件
 */

import type {
  AuthSessionManager,
  JWTManager,
  MultiDeviceManager,
  PasswordHasher,
  RBAC,
  RowFilter,
  SessionManager,
  TOTPManager,
  TokenRefreshManager,
} from '@ventostack/auth';
import type { Cache } from '@ventostack/cache';
import { createRouter } from '@ventostack/core';
import type { Router } from '@ventostack/core';
import type { Database } from '@ventostack/database';
import type { EventBus } from '@ventostack/events';
import type { AuditStore } from '@ventostack/observability';
import { createCacheKeyNamespace } from './services/cache-key';
import type { CacheKeyNamespace } from './services/cache-key';

import { OperationLogModel } from './models/log';
import { UserModel } from './models/user';
import { createAuthService } from './services/auth';
import { createConfigService } from './services/config';
import type { CreateConfigParams } from './services/config';
import { createDeptService } from './services/dept';
import type { CreateDeptParams, UpdateDeptParams } from './services/dept';
import { createDictService } from './services/dict';
import type { CreateDictDataParams, CreateDictTypeParams } from './services/dict';
import { createMenuService } from './services/menu';
import type { CreateMenuParams } from './services/menu';
import { createMenuTreeBuilder } from './services/menu-tree-builder';
import { createNoticeService } from './services/notice';
import type { CreateNoticeParams, UpdateNoticeParams } from './services/notice';
import { createPasskeyService } from './services/passkey';
import { createPermissionLoader } from './services/permission-loader';
import { createPostService } from './services/post';
import type { CreatePostParams, UpdatePostParams } from './services/post';
import { createRoleService } from './services/role';
import type { CreateRoleParams } from './services/role';
import { createTagService } from './services/tag';
import type { CreateTagParams, UpdateTagParams } from './services/tag';
import { createUserService } from './services/user';
import type { UpdateUserParams } from './services/user';

import { createAuthMiddleware, createPermMiddleware } from '@ventostack/auth';
import { fail, pageOf, paginated, parseBody, success } from '@ventostack/core';
import { type OperationLogEntry, createOperationLogMiddleware } from './middlewares/operation-log';
import { createAuthRoutes } from './routes/auth';
import { createCrudRoutes } from './routes/crud';
import { createPasskeyRoutes } from './routes/passkey';
import { createUserRoutes } from './routes/user';
import { validatePassword } from './services/password-policy';

export interface SystemModule {
  services: {
    auth: ReturnType<typeof createAuthService>;
    user: ReturnType<typeof createUserService>;
    role: ReturnType<typeof createRoleService>;
    menu: ReturnType<typeof createMenuService>;
    dept: ReturnType<typeof createDeptService>;
    post: ReturnType<typeof createPostService>;
    dict: ReturnType<typeof createDictService>;
    config: ReturnType<typeof createConfigService>;
    notice: ReturnType<typeof createNoticeService>;
    permissionLoader: ReturnType<typeof createPermissionLoader>;
    menuTreeBuilder: ReturnType<typeof createMenuTreeBuilder>;
    passkey: ReturnType<typeof createPasskeyService>;
    tag: ReturnType<typeof createTagService>;
  };
  router: Router;
  init(): Promise<void>;
}

export interface FileUploader {
  upload(
    filename: string,
    data: Buffer,
    contentType: string,
    bucket: string,
    uploaderId: string,
  ): Promise<string>;
}

export interface SystemModuleDeps {
  db: Database;
  cache: Cache;
  jwt: JWTManager;
  jwtSecret: string;
  passwordHasher: PasswordHasher;
  totp: TOTPManager;
  rbac: RBAC;
  rowFilter: RowFilter;
  sessionManager: SessionManager;
  deviceManager: MultiDeviceManager;
  tokenRefresh: TokenRefreshManager;
  authSessionManager: AuthSessionManager;
  auditLog: AuditStore;
  eventBus: EventBus;
  rpID?: string;
  rpName?: string;
  rpOrigins?: string[];
  fileUploader?: FileUploader;
  /** 可信代理 IP/CIDR 列表，用于安全提取客户端真实 IP */
  trustedProxies?: string[];
  /** 是否启用多租户隔离 */
  tenantEnabled?: boolean;
  /** 当前租户 ID，启用多租户时传入以隔离缓存键 */
  tenantId?: string;
}

export function createSystemModule(deps: SystemModuleDeps): SystemModule {
  const {
    db,
    cache,
    jwt,
    jwtSecret,
    passwordHasher,
    totp,
    rbac,
    rowFilter,
    auditLog,
    authSessionManager,
    eventBus,
    fileUploader,
  } = deps;

  const tenantEnabled = deps.tenantEnabled === true;
  const tenantId = tenantEnabled ? deps.tenantId : undefined;
  const ns: CacheKeyNamespace = createCacheKeyNamespace(tenantId);

  // Services
  const configService = createConfigService({ db, cache, tenantId });
  const authService = createAuthService({
    db,
    cache,
    jwt,
    jwtSecret,
    passwordHasher,
    totp,
    authSessionManager,
    auditStore: auditLog,
    eventBus,
    configService,
  });
  const userService = createUserService({ db, passwordHasher, cache, configService, tenantId });
  const roleService = createRoleService({ db, cache, tenantId });
  const menuService = createMenuService({ db });
  const deptService = createDeptService({ db });
  const postService = createPostService({ db });
  const dictService = createDictService({ db, cache, tenantId });
  const noticeService = createNoticeService({ db });
  const permissionLoader = createPermissionLoader({ db, rbac, rowFilter });
  const menuTreeBuilder = createMenuTreeBuilder({ db });
  const passkeyService = createPasskeyService({
    db,
    cache,
    rpID: deps.rpID ?? 'localhost',
    rpName: deps.rpName ?? 'VentoStack Admin',
    rpOrigins: deps.rpOrigins ?? ['http://localhost:5173'],
    auditStore: auditLog,
  });
  const tagService = createTagService({ db });

  // Middlewares
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);

  // 操作日志数据库写入函数
  const saveOperationLog = async (entry: OperationLogEntry): Promise<void> => {
    await db.query(OperationLogModel).insert({
      id: entry.id,
      user_id: entry.user_id,
      username: entry.username,
      module: entry.module,
      action: entry.action,
      method: entry.method,
      url: entry.url,
      ip: entry.ip,
      params: entry.params,
      result: entry.result,
      error_msg: entry.error_msg,
      duration: entry.duration,
      created_at: entry.created_at,
    });
  };

  const opLogMiddleware = createOperationLogMiddleware(auditLog, {
    saveToDb: saveOperationLog,
    excludePathPrefixes: ['/api/system/operation-logs', '/api/system/login-logs'],
    trustedProxies: deps.trustedProxies ?? [],
  });

  // Routes
  const router = createRouter();

  // ---- 公开配置接口（无需认证） ----
  router.get(
    '/api/system/configs/public',
    {
      responses: {
        200: {
          siteName: { type: 'string' as const, description: '站点名称' },
          deptEnabled: { type: 'boolean' as const, description: '是否启用部门' },
          mfaEnabled: { type: 'boolean' as const, description: '是否启用 MFA' },
          mfaForce: { type: 'boolean' as const, description: '是否强制 MFA' },
          passkeyEnabled: { type: 'boolean' as const, description: '是否启用 Passkey' },
          passwordMinLength: { type: 'number' as const, description: '密码最小长度' },
          passwordComplexity: {
            type: 'string' as const,
            description: '密码复杂度: low/medium/high',
          },
        },
      },
      openapi: { summary: '获取公开配置', tags: ['config'], operationId: 'getPublicConfig' },
    },
    async () => {
      const [
        siteName,
        deptEnabled,
        mfaEnabled,
        mfaForce,
        passkeyEnabled,
        passwordMinLength,
        passwordComplexity,
      ] = await Promise.all([
        configService.getValue('sys_site_name'),
        configService.getValue('sys_dept_enabled'),
        configService.getValue('sys_mfa_enabled'),
        configService.getValue('sys_mfa_force'),
        configService.getValue('sys_passkey_enabled'),
        configService.getValue('sys_password_min_length'),
        configService.getValue('sys_password_complexity'),
      ]);
      return success({
        siteName: siteName ?? 'VentoStack',
        deptEnabled: deptEnabled !== 'false',
        mfaEnabled: mfaEnabled !== 'false',
        mfaForce: mfaForce === 'true',
        passkeyEnabled: passkeyEnabled !== 'false',
        passwordMinLength: Number(passwordMinLength) || 6,
        passwordComplexity:
          passwordComplexity === 'medium' || passwordComplexity === 'high'
            ? passwordComplexity
            : 'low',
      });
    },
  );

  router.merge(createAuthRoutes(authService, authMiddleware, perm, deps.trustedProxies ?? []));
  router.merge(
    createPasskeyRoutes(
      passkeyService,
      authService,
      authMiddleware,
      cache,
      configService,
      deps.trustedProxies ?? [],
    ),
  );
  router.merge(createUserRoutes(userService, authMiddleware, perm, opLogMiddleware));

  // CRUD routes for other entities
  router.merge(
    createCrudRoutes({
      basePath: '/api/system/roles',
      resource: 'system:role',
      service: {
        ...roleService,
        create: (body) => roleService.create(body as CreateRoleParams),
        update: (id, body) => roleService.update(id, body as Partial<CreateRoleParams>),
      },
      authMiddleware,
      perm,
      operationLogMiddleware: opLogMiddleware,
      schemas: {
        item: {
          id: { type: 'uuid' as const, description: '角色 ID' },
          name: { type: 'string' as const, description: '角色名称' },
          code: { type: 'string' as const, description: '角色编码' },
          sort: { type: 'int' as const, description: '排序' },
          status: { type: 'int' as const, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
          createdAt: { type: 'date' as const, description: '创建时间' },
        },
        createBody: {
          name: { type: 'string' as const, required: true, description: '角色名称' },
          code: { type: 'string' as const, required: true, description: '角色编码' },
          sort: { type: 'int' as const, default: 0, description: '排序' },
          status: { type: 'int' as const, default: 1, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
        },
        updateBody: {
          name: { type: 'string' as const, description: '角色名称' },
          code: { type: 'string' as const, description: '角色编码' },
          sort: { type: 'int' as const, description: '排序' },
          status: { type: 'int' as const, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
        },
      },
      extraRoutes: (r) => {
        r.get(
          '/api/system/roles/:id/menus',
          {
            responses: {
              200: { menuIds: { type: 'array' as const, description: '菜单 ID 列表' } },
            },
            openapi: { summary: '获取角色已分配菜单', tags: ['role'], operationId: 'getRoleMenus' },
          },
          async (ctx) => {
            const id = (ctx.params as Record<string, string>).id!;
            const menuIds = await roleService.getRoleMenuIds(id);
            return success({ menuIds });
          },
          perm('system', 'role:list'),
        );
        r.put(
          '/api/system/roles/:id/menus',
          {
            body: {
              menuIds: { type: 'array' as const, required: true, description: '菜单 ID 列表' },
            },
            openapi: { summary: '分配角色菜单', tags: ['role'], operationId: 'assignRoleMenus' },
          },
          async (ctx) => {
            const id = (ctx.params as Record<string, string>).id!;
            const body = await parseBody(ctx.request);
            const menuIds = (body.menuIds as string[]) ?? [];
            await roleService.assignMenus(id, menuIds);
            return success(null);
          },
          perm('system', 'role:update'),
        );
        r.put(
          '/api/system/roles/:id/data-scope',
          {
            body: {
              scope: { type: 'int' as const, required: true, description: '数据范围' },
              deptIds: { type: 'array' as const, description: '部门 ID 列表' },
            },
            openapi: {
              summary: '分配角色数据范围',
              tags: ['role'],
              operationId: 'assignRoleDataScope',
            },
          },
          async (ctx) => {
            const id = (ctx.params as Record<string, string>).id!;
            const body = await parseBody(ctx.request);
            await roleService.assignDataScope(
              id,
              body.scope as number,
              body.deptIds as string[] | undefined,
            );
            return success(null);
          },
          perm('system', 'role:update'),
        );
        // Batch delete roles
        r.post(
          '/api/system/roles/batch-delete',
          {
            body: { ids: { type: 'array' as const, required: true, description: '角色 ID 列表' } },
            openapi: { summary: '批量删除角色', tags: ['role'] },
          },
          async (ctx) => {
            const body = await parseBody(ctx.request);
            const ids = (body.ids as string[]) ?? [];
            let successCount = 0;
            let skipped = 0;
            for (const id of ids) {
              try {
                // Check if role has users assigned
                const cnt = (await db.raw(
                  'SELECT COUNT(*) as cnt FROM sys_user_role WHERE role_id = $1',
                  [id],
                )) as Array<{ cnt: number }>;
                if (Number(cnt[0]?.cnt ?? 0) > 0) {
                  skipped++;
                  continue;
                }
                await roleService.delete(id);
                successCount++;
              } catch {
                skipped++;
              }
            }
            return success({ success: successCount, skipped });
          },
          perm('system', 'role:delete'),
        );
      },
    }),
  );

  router.merge(
    createCrudRoutes({
      basePath: '/api/system/menus',
      resource: 'system:menu',
      service: {
        ...menuService,
        list: async () => {
          const tree = await menuService.getAllTree();
          return { items: tree, total: tree.length, page: 1, pageSize: tree.length };
        },
        create: (body) => menuService.create(body as CreateMenuParams),
        update: (id, body) => menuService.update(id, body as Record<string, unknown>),
      },
      authMiddleware,
      perm,
      operationLogMiddleware: opLogMiddleware,
      schemas: {
        item: {
          id: { type: 'uuid' as const, description: '菜单 ID' },
          parentId: { type: 'uuid' as const, description: '父菜单 ID' },
          name: { type: 'string' as const, description: '菜单名称' },
          path: { type: 'string' as const, description: '路由路径' },
          component: { type: 'string' as const, description: '组件路径' },
          icon: { type: 'string' as const, description: '图标' },
          sort: { type: 'int' as const, description: '排序' },
          type: { type: 'string' as const, description: '菜单类型' },
          visible: { type: 'int' as const, description: '是否可见' },
          status: { type: 'int' as const, description: '状态' },
          permission: { type: 'string' as const, description: '权限标识' },
        },
        createBody: {
          parentId: { type: 'uuid' as const, description: '父菜单 ID' },
          name: { type: 'string' as const, required: true, description: '菜单名称' },
          path: { type: 'string' as const, description: '路由路径' },
          component: { type: 'string' as const, description: '组件路径' },
          icon: { type: 'string' as const, description: '图标' },
          sort: { type: 'int' as const, default: 0, description: '排序' },
          type: {
            type: 'string' as const,
            required: true,
            enum: ['D', 'M', 'B'],
            description: '类型 D=目录 M=菜单 B=按钮',
          },
          visible: { type: 'int' as const, default: 1, description: '是否可见' },
          status: { type: 'int' as const, default: 1, description: '状态' },
          permission: { type: 'string' as const, description: '权限标识' },
        },
        updateBody: {
          parentId: { type: 'uuid' as const, description: '父菜单 ID' },
          name: { type: 'string' as const, description: '菜单名称' },
          path: { type: 'string' as const, description: '路由路径' },
          component: { type: 'string' as const, description: '组件路径' },
          icon: { type: 'string' as const, description: '图标' },
          sort: { type: 'int' as const, description: '排序' },
          type: { type: 'string' as const, enum: ['D', 'M', 'B'], description: '类型' },
          visible: { type: 'int' as const, description: '是否可见' },
          status: { type: 'int' as const, description: '状态' },
          permission: { type: 'string' as const, description: '权限标识' },
        },
      },
      extraRoutes: (r) => {
        r.get(
          '/api/system/menus/tree',
          {
            responses: { 200: { type: 'array' as const, description: '菜单树' } },
            openapi: { summary: '获取菜单树', tags: ['menu'], operationId: 'getMenuTree' },
          },
          async () => {
            const tree = await menuService.getTree();
            return success(tree);
          },
          perm('system', 'menu:list'),
        );
      },
    }),
  );

  router.merge(
    createCrudRoutes({
      basePath: '/api/system/depts',
      resource: 'system:dept',
      service: {
        ...deptService,
        list: async () => {
          const tree = await deptService.getTree();
          return { items: tree, total: tree.length, page: 1, pageSize: tree.length };
        },
        create: (body) => deptService.create(body as CreateDeptParams),
        update: (id, body) => deptService.update(id, body as UpdateDeptParams),
      },
      authMiddleware,
      perm,
      operationLogMiddleware: opLogMiddleware,
      schemas: {
        item: {
          id: { type: 'uuid' as const, description: '部门 ID' },
          parentId: { type: 'uuid' as const, description: '父部门 ID' },
          name: { type: 'string' as const, description: '部门名称' },
          sort: { type: 'int' as const, description: '排序' },
          leader: { type: 'string' as const, description: '负责人' },
          phone: { type: 'string' as const, format: 'phone', description: '联系电话' },
          email: { type: 'string' as const, description: '邮箱' },
          status: { type: 'int' as const, description: '状态' },
        },
        createBody: {
          parentId: { type: 'uuid' as const, description: '父部门 ID' },
          name: { type: 'string' as const, required: true, description: '部门名称' },
          sort: { type: 'int' as const, default: 0, description: '排序' },
          leader: { type: 'string' as const, description: '负责人' },
          phone: { type: 'string' as const, format: 'phone', description: '联系电话' },
          email: { type: 'string' as const, format: 'email', description: '邮箱' },
          status: { type: 'int' as const, default: 1, description: '状态' },
        },
        updateBody: {
          parentId: { type: 'uuid' as const, description: '父部门 ID' },
          name: { type: 'string' as const, description: '部门名称' },
          sort: { type: 'int' as const, description: '排序' },
          leader: { type: 'string' as const, description: '负责人' },
          phone: { type: 'string' as const, format: 'phone', description: '联系电话' },
          email: { type: 'string' as const, format: 'email', description: '邮箱' },
          status: { type: 'int' as const, description: '状态' },
        },
      },
      extraRoutes: (r) => {
        r.get(
          '/api/system/depts/tree',
          {
            responses: { 200: { type: 'array' as const, description: '部门树' } },
            openapi: { summary: '获取部门树', tags: ['dept'], operationId: 'getDeptTree' },
          },
          async () => {
            const tree = await deptService.getTree();
            return success(tree);
          },
          perm('system', 'dept:list'),
        );
        // Batch delete depts
        r.post(
          '/api/system/depts/batch-delete',
          {
            body: { ids: { type: 'array' as const, required: true, description: '部门 ID 列表' } },
            openapi: { summary: '批量删除部门', tags: ['dept'] },
          },
          async (ctx) => {
            const body = await parseBody(ctx.request);
            const ids = (body.ids as string[]) ?? [];
            let successCount = 0;
            let skipped = 0;
            for (const id of ids) {
              try {
                // Check if dept has children
                const children = (await db.raw(
                  'SELECT COUNT(*) as cnt FROM sys_dept WHERE parent_id = $1 AND deleted_at IS NULL',
                  [id],
                )) as Array<{ cnt: number }>;
                if (Number(children[0]?.cnt ?? 0) > 0) {
                  skipped++;
                  continue;
                }
                await deptService.delete(id);
                successCount++;
              } catch {
                skipped++;
              }
            }
            return success({ success: successCount, skipped });
          },
          perm('system', 'dept:delete'),
        );
      },
    }),
  );

  router.merge(
    createCrudRoutes({
      basePath: '/api/system/posts',
      resource: 'system:post',
      service: {
        ...postService,
        create: (body) => postService.create(body as CreatePostParams),
        update: (id, body) => postService.update(id, body as UpdatePostParams),
      },
      authMiddleware,
      perm,
      operationLogMiddleware: opLogMiddleware,
      schemas: {
        item: {
          id: { type: 'uuid' as const, description: '岗位 ID' },
          name: { type: 'string' as const, description: '岗位名称' },
          code: { type: 'string' as const, description: '岗位编码' },
          sort: { type: 'int' as const, description: '排序' },
          status: { type: 'int' as const, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
        },
        createBody: {
          name: { type: 'string' as const, required: true, description: '岗位名称' },
          code: { type: 'string' as const, required: true, description: '岗位编码' },
          sort: { type: 'int' as const, default: 0, description: '排序' },
          status: { type: 'int' as const, default: 1, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
        },
        updateBody: {
          name: { type: 'string' as const, description: '岗位名称' },
          code: { type: 'string' as const, description: '岗位编码' },
          sort: { type: 'int' as const, description: '排序' },
          status: { type: 'int' as const, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
        },
      },
      extraRoutes: (r) => {
        // Batch delete posts
        r.post(
          '/api/system/posts/batch-delete',
          {
            body: { ids: { type: 'array' as const, required: true, description: '岗位 ID 列表' } },
            openapi: { summary: '批量删除岗位', tags: ['post'] },
          },
          async (ctx) => {
            const body = await parseBody(ctx.request);
            const ids = (body.ids as string[]) ?? [];
            let successCount = 0;
            let skipped = 0;
            for (const id of ids) {
              try {
                await postService.delete(id);
                successCount++;
              } catch {
                skipped++;
              }
            }
            return success({ success: successCount, skipped });
          },
          perm('system', 'post:delete'),
        );
      },
    }),
  );

  router.merge(
    createCrudRoutes({
      basePath: '/api/system/dict/types',
      resource: 'system:dict',
      service: {
        ...dictService,
        list: (params) => dictService.listTypes(params),
        create: (body) => dictService.createType(body as CreateDictTypeParams),
        update: (idOrCode, body) =>
          dictService.updateType(idOrCode, body as Record<string, unknown>),
        delete: (idOrCode) => dictService.deleteType(idOrCode),
        getById: (_code) =>
          dictService.listTypes({ page: 1, pageSize: 1 }).then((r) => r.items[0] ?? null),
      },
      authMiddleware,
      perm,
      operationLogMiddleware: opLogMiddleware,
      schemas: {
        item: {
          id: { type: 'uuid' as const, description: '字典类型 ID' },
          name: { type: 'string' as const, description: '字典名称' },
          code: { type: 'string' as const, description: '字典编码' },
          isSystem: { type: 'boolean' as const, description: '是否系统内置' },
          sort: { type: 'int' as const, description: '排序' },
          status: { type: 'int' as const, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
        },
        createBody: {
          name: { type: 'string' as const, required: true, description: '字典名称' },
          code: { type: 'string' as const, required: true, description: '字典编码' },
          sort: { type: 'int' as const, default: 0, description: '排序' },
          status: { type: 'int' as const, default: 1, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
        },
        updateBody: {
          name: { type: 'string' as const, description: '字典名称' },
          sort: { type: 'int' as const, description: '排序' },
          status: { type: 'int' as const, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
        },
      },
      extraRoutes: (r) => {
        r.get(
          '/api/system/dict/types/:code/data',
          {
            params: {
              code: { type: 'string' as const, description: '字典类型编码' },
            },
            responses: {
              200: {
                type: 'array',
                description: '字典数据列表',
              },
            },
            openapi: { summary: '获取字典数据', tags: ['dict'], operationId: 'getDictData' },
          },
          async (ctx) => {
            const code = (ctx.params as Record<string, string>).code!;
            const data = await dictService.listDataByType(code);
            return success(data);
          },
        );
      },
    }),
  );

  router.merge(
    createCrudRoutes({
      basePath: '/api/system/configs',
      resource: 'system:config',
      service: {
        ...configService,
        create: (body) => configService.create(body as CreateConfigParams),
        update: (id, body) => configService.update(id, body as Record<string, unknown>),
      },
      authMiddleware,
      perm,
      operationLogMiddleware: opLogMiddleware,
      schemas: {
        item: {
          id: { type: 'uuid' as const, description: '配置 ID' },
          name: { type: 'string' as const, description: '配置名称' },
          key: { type: 'string' as const, description: '配置键' },
          value: { type: 'string' as const, description: '配置值' },
          type: { type: 'string' as const, description: '配置类型' },
          remark: { type: 'string' as const, description: '备注' },
        },
        createBody: {
          name: { type: 'string' as const, required: true, description: '配置名称' },
          key: { type: 'string' as const, required: true, description: '配置键' },
          value: { type: 'string' as const, required: true, description: '配置值' },
          type: { type: 'string' as const, description: '配置类型' },
          remark: { type: 'string' as const, description: '备注' },
        },
        updateBody: {
          name: { type: 'string' as const, description: '配置名称' },
          value: { type: 'string' as const, description: '配置值' },
          type: { type: 'string' as const, description: '配置类型' },
          remark: { type: 'string' as const, description: '备注' },
        },
      },
      extraRoutes: (r) => {
        r.get(
          '/api/system/configs/by-key/:key',
          {
            responses: {
              200: {
                key: { type: 'string' as const, description: '配置键' },
                value: { type: 'string' as const, description: '配置值' },
              },
            },
            openapi: {
              summary: '按 key 获取配置',
              tags: ['config'],
              operationId: 'getConfigByKey',
            },
          },
          async (ctx) => {
            const key = (ctx.params as Record<string, string>).key!;
            const value = await configService.getValue(key);
            if (value === null) return fail('Config not found', 404, 404);
            return success({ key, value });
          },
          perm('system', 'config:query'),
        );
      },
    }),
  );

  router.merge(
    createCrudRoutes({
      basePath: '/api/system/notices',
      resource: 'system:notice',
      service: {
        ...noticeService,
        create: (body) => noticeService.create(body as CreateNoticeParams),
        update: (id, body) => noticeService.update(id, body as UpdateNoticeParams),
      },
      authMiddleware,
      perm,
      operationLogMiddleware: opLogMiddleware,
      schemas: {
        item: {
          id: { type: 'uuid' as const, description: '通知 ID' },
          title: { type: 'string' as const, description: '通知标题' },
          content: { type: 'string' as const, description: '通知内容' },
          type: { type: 'string' as const, description: '通知类型' },
          status: { type: 'int' as const, description: '状态' },
          createdAt: { type: 'date' as const, description: '创建时间' },
        },
        createBody: {
          title: { type: 'string' as const, required: true, description: '通知标题' },
          content: { type: 'string' as const, required: true, description: '通知内容' },
          type: { type: 'string' as const, required: true, description: '通知类型' },
        },
        updateBody: {
          title: { type: 'string' as const, description: '通知标题' },
          content: { type: 'string' as const, description: '通知内容' },
          type: { type: 'string' as const, description: '通知类型' },
        },
      },
      extraRoutes: (r) => {
        r.put(
          '/api/system/notices/:id/publish',
          {
            openapi: { summary: '发布通知', tags: ['notice'], operationId: 'publishNotice' },
          },
          async (ctx) => {
            const id = (ctx.params as Record<string, string>).id!;
            const user = ctx.user as { id: string };
            await noticeService.publish(id, user.id);
            return success(null);
          },
          perm('system', 'notice:update'),
        );
        r.put(
          '/api/system/notices/:id/read',
          {
            openapi: { summary: '标记已读', tags: ['notice'], operationId: 'markNoticeRead' },
          },
          async (ctx) => {
            const id = (ctx.params as Record<string, string>).id!;
            const user = ctx.user as { id: string };
            await noticeService.markRead(user.id, id);
            return success(null);
          },
        );
        // Batch publish
        r.post(
          '/api/system/notices/batch-publish',
          {
            body: { ids: { type: 'array' as const, required: true, description: '通知 ID 列表' } },
            openapi: { summary: '批量发布通知', tags: ['notice'] },
          },
          async (ctx) => {
            const body = await parseBody(ctx.request);
            const ids = (body.ids as string[]) ?? [];
            const user = ctx.user as { id: string };
            let successCount = 0;
            let skipped = 0;
            for (const id of ids) {
              const rows = (await db.raw(
                'SELECT status FROM sys_notice WHERE id = $1 AND deleted_at IS NULL',
                [id],
              )) as Array<{ status: number }>;
              if (!rows.length || rows[0]!.status === 1) {
                skipped++;
                continue;
              }
              await noticeService.publish(id, user.id);
              successCount++;
            }
            return success({ success: successCount, skipped });
          },
          perm('system', 'notice:update'),
        );
        // Batch revoke (unpublish)
        r.post(
          '/api/system/notices/batch-revoke',
          {
            body: { ids: { type: 'array' as const, required: true, description: '通知 ID 列表' } },
            openapi: { summary: '批量撤回通知', tags: ['notice'] },
          },
          async (ctx) => {
            const body = await parseBody(ctx.request);
            const ids = (body.ids as string[]) ?? [];
            let successCount = 0;
            let skipped = 0;
            for (const id of ids) {
              const rows = (await db.raw(
                'SELECT status FROM sys_notice WHERE id = $1 AND deleted_at IS NULL',
                [id],
              )) as Array<{ status: number }>;
              if (!rows.length || rows[0]!.status !== 1) {
                skipped++;
                continue;
              }
              await noticeService.revoke(id);
              successCount++;
            }
            return success({ success: successCount, skipped });
          },
          perm('system', 'notice:update'),
        );
        // Batch delete
        r.post(
          '/api/system/notices/batch-delete',
          {
            body: { ids: { type: 'array' as const, required: true, description: '通知 ID 列表' } },
            openapi: { summary: '批量删除通知', tags: ['notice'] },
          },
          async (ctx) => {
            const body = await parseBody(ctx.request);
            const ids = (body.ids as string[]) ?? [];
            let successCount = 0;
            let skipped = 0;
            for (const id of ids) {
              try {
                await noticeService.delete(id);
                successCount++;
              } catch {
                skipped++;
              }
            }
            return success({ success: successCount, skipped });
          },
          perm('system', 'notice:delete'),
        );
      },
    }),
  );

  // Tag CRUD routes
  router.merge(
    createCrudRoutes({
      basePath: '/api/system/tags',
      resource: 'system:tag',
      service: {
        ...tagService,
        list: (params) =>
          tagService.list({
            page: params.page as number,
            pageSize: params.pageSize as number,
            status: params.status as number | undefined,
          }),
        create: (body) => tagService.create(body as CreateTagParams),
        update: (id, body) => tagService.update(id, body as UpdateTagParams),
      },
      authMiddleware,
      perm,
      operationLogMiddleware: opLogMiddleware,
      schemas: {
        item: {
          id: { type: 'uuid' as const, description: '标签 ID' },
          name: { type: 'string' as const, description: '标签名称' },
          code: { type: 'string' as const, description: '标签标识' },
          sort: { type: 'int' as const, description: '排序' },
          status: { type: 'int' as const, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
          createdAt: { type: 'date' as const, description: '创建时间' },
        },
        createBody: {
          name: { type: 'string' as const, required: true, description: '标签名称' },
          code: { type: 'string' as const, required: true, description: '标签标识' },
          sort: { type: 'int' as const, default: 0, description: '排序' },
          remark: { type: 'string' as const, description: '备注' },
        },
        updateBody: {
          name: { type: 'string' as const, description: '标签名称' },
          code: { type: 'string' as const, description: '标签标识' },
          sort: { type: 'int' as const, description: '排序' },
          status: { type: 'int' as const, description: '状态' },
          remark: { type: 'string' as const, description: '备注' },
        },
      },
      extraRoutes: (r) => {
        // 获取全部有效标签（供选择器用）
        r.get(
          '/api/system/tags/all',
          {
            responses: { 200: { type: 'array' as const, description: '全部有效标签' } },
            openapi: { summary: '获取全部有效标签', tags: ['tag'], operationId: 'listAllTags' },
          },
          async () => {
            const items = await tagService.listAll();
            return success(items);
          },
          perm('system', 'tag:list'),
        );
        // 获取标签下的用户 ID 列表
        r.get(
          '/api/system/tags/:id/users',
          {
            responses: { 200: { type: 'array' as const, description: '用户 ID 列表' } },
            openapi: { summary: '获取标签关联用户', tags: ['tag'], operationId: 'getTagUsers' },
          },
          async (ctx) => {
            const id = (ctx.params as Record<string, string>).id!;
            const userIds = await tagService.getUserIdsByTag(id);
            return success(userIds);
          },
          perm('system', 'tag:query'),
        );
        // 根据标签 code 获取用户 ID 列表
        r.get(
          '/api/system/tags/by-code/:code/users',
          {
            responses: { 200: { type: 'array' as const, description: '用户 ID 列表' } },
            openapi: {
              summary: '根据标签标识获取关联用户',
              tags: ['tag'],
              operationId: 'getTagUsersByCode',
            },
          },
          async (ctx) => {
            const code = (ctx.params as Record<string, string>).code!;
            const userIds = await tagService.getUserIdsByTagCode(code);
            return success(userIds);
          },
          perm('system', 'tag:query'),
        );
      },
    }),
  );

  // User self-service routes (use sub-router with group auth middleware)
  const userRouter = createRouter();
  userRouter.use(authMiddleware);
  userRouter.use(opLogMiddleware);

  userRouter.get(
    '/api/system/user/profile',
    {
      responses: {
        200: {
          id: { type: 'uuid' as const, description: '用户 ID' },
          username: { type: 'string' as const, description: '用户名' },
          nickname: { type: 'string' as const, description: '昵称' },
          email: { type: 'string' as const, description: '邮箱' },
          phone: { type: 'string' as const, format: 'phone', description: '手机号' },
          avatar: { type: 'string' as const, description: '头像' },
          roles: { type: 'array' as const, description: '角色编码列表' },
          permissions: { type: 'array' as const, description: '权限列表' },
        },
      },
      openapi: { summary: '获取当前用户信息', tags: ['user'], operationId: 'getUserProfile' },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail('未登录', 401, 401);
      const detail = await userService.getById(user.id);
      if (!detail) return success(null);
      const permissions = await menuTreeBuilder.buildPermissionsForUser(user.id);
      const roles =
        ((detail as unknown as Record<string, unknown>).roles as Array<{ code: string }>) ?? [];
      return success({
        ...detail,
        roles: roles.map((r: { code: string }) => r.code),
        permissions,
      });
    },
  );

  userRouter.get(
    '/api/system/user/routes',
    {
      responses: { 200: { type: 'array' as const, description: '路由树' } },
      openapi: { summary: '获取当前用户路由', tags: ['user'], operationId: 'getUserRoutes' },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail('未登录', 401, 401);
      const tree = await menuTreeBuilder.buildRoutesForUser(user.id);
      return success(tree);
    },
  );

  userRouter.get(
    '/api/system/user/permissions',
    {
      responses: { 200: { type: 'array' as const, description: '权限列表' } },
      openapi: { summary: '获取当前用户权限', tags: ['user'], operationId: 'getUserPermissions' },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail('未登录', 401, 401);
      const permissions = await menuTreeBuilder.buildPermissionsForUser(user.id);
      return success(permissions);
    },
  );

  // === User profile self-service ===
  userRouter.put(
    '/api/system/user/profile',
    {
      body: {
        nickname: { type: 'string' as const, description: '昵称' },
        email: { type: 'string' as const, format: 'email', description: '邮箱' },
        phone: { type: 'string' as const, format: 'phone', description: '手机号' },
        gender: { type: 'string' as const, description: '性别 male/female/unknown' },
      },
      openapi: { summary: '更新当前用户信息', tags: ['user'], operationId: 'updateUserProfile' },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail('未登录', 401, 401);
      const body = await parseBody(ctx.request);
      const { nickname, email, phone, gender } = body as {
        nickname?: string;
        email?: string;
        phone?: string;
        gender?: number | string;
      };
      const updates: Record<string, unknown> = {};
      if (nickname !== undefined) updates.nickname = nickname;
      if (email !== undefined) updates.email = email;
      if (phone !== undefined) updates.phone = phone;
      if (gender !== undefined) {
        // 兼容前端字符串和数字：male/female/unknown → 1/2/0
        const genderMap: Record<string, number> = { unknown: 0, male: 1, female: 2 };
        const genderVal =
          typeof gender === 'string' ? (genderMap[gender] ?? Number(gender)) : gender;
        if (!Number.isNaN(genderVal)) updates.gender = genderVal;
      }
      await userService.update(user.id, updates as UpdateUserParams);
      return success(null);
    },
  );

  userRouter.put(
    '/api/system/user/profile/password',
    {
      body: {
        oldPassword: { type: 'string' as const, required: true, description: '旧密码' },
        newPassword: { type: 'string' as const, required: true, min: 6, description: '新密码' },
      },
      openapi: { summary: '修改密码', tags: ['user'], operationId: 'changePassword' },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail('未登录', 401, 401);
      const body = await parseBody(ctx.request);
      const { oldPassword, newPassword } = body as { oldPassword?: string; newPassword?: string };
      if (!oldPassword || !newPassword) return fail('缺少必填参数', 400, 400);

      // 验证旧密码
      const profile = await db
        .query(UserModel)
        .where('id', '=', user.id)
        .select('password_hash')
        .get();
      if (!profile) return fail('用户不存在', 404, 404);

      const matched = await deps.passwordHasher.verify(oldPassword, profile.password_hash);
      if (!matched) return fail('旧密码错误', 400, 400);

      // 密码策略校验
      const minLength = Number(await configService.getValue('sys_password_min_length')) || 6;
      const complexity =
        ((await configService.getValue('sys_password_complexity')) as 'low' | 'medium' | 'high') ||
        'low';
      const validation = validatePassword(newPassword, { minLength, complexity });
      if (!validation.valid) return fail(validation.message, 400, 400);

      const hash = await deps.passwordHasher.hash(newPassword);
      await db.query(UserModel).where('id', '=', user.id).update({
        password_hash: hash,
        password_changed_at: new Date(),
      });
      await cache.del(ns.detailKey('user', user.id));
      return success(null);
    },
  );

  userRouter.post(
    '/api/system/user/profile/avatar',
    {
      formData: {
        file: { type: 'file' as const, required: true, description: '头像文件' },
      },
      responses: { 200: { avatar: { type: 'string' as const, description: '头像 URL' } } },
      openapi: { summary: '上传头像', tags: ['user'], operationId: 'uploadAvatar' },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail('未登录', 401, 401);

      const contentType = ctx.request.headers.get('content-type') ?? '';
      if (!contentType.includes('multipart/form-data')) {
        return fail('仅支持 multipart/form-data', 400, 400);
      }

      const formData = await ctx.request.formData();
      const file = formData.get('file');
      if (!file || !(file instanceof File)) {
        return fail('请上传文件', 400, 400);
      }

      // 限制文件大小 (2MB) 和类型
      if (file.size > 2 * 1024 * 1024) return fail('文件大小不能超过2MB', 400, 400);
      const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) return fail('仅支持 PNG/JPG/GIF/WEBP 格式', 400, 400);

      const arrayBuffer = await file.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      let avatarUrl: string;

      if (fileUploader) {
        // 使用文件存储服务（本地 / S3）
        avatarUrl = await fileUploader.upload(file.name, data, file.type, 'avatars', user.id);
      } else {
        // 兜底：base64 存入数据库
        avatarUrl = `data:${file.type};base64,${data.toString('base64')}`;
      }

      await db.query(UserModel).where('id', '=', user.id).update({ avatar: avatarUrl });
      await cache.del(ns.detailKey('user', user.id));
      return success({ avatar: avatarUrl });
    },
  );

  // === MFA status ===
  userRouter.get(
    '/api/auth/mfa/status',
    {
      responses: { 200: { enabled: { type: 'boolean' as const, description: 'MFA 是否启用' } } },
      openapi: { summary: '获取 MFA 状态', tags: ['auth'], operationId: 'getMFAStatus' },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      if (!user?.id) return fail('未登录', 401, 401);
      const mfaUser = await db
        .query(UserModel)
        .where('id', '=', user.id)
        .select('mfa_enabled')
        .get();
      if (!mfaUser) return fail('用户不存在', 404, 404);
      return success({ enabled: mfaUser.mfa_enabled });
    },
  );

  // === Dict data CRUD ===
  userRouter.post(
    '/api/system/dict/data',
    {
      body: {
        dictType: { type: 'string' as const, required: true, description: '字典类型编码' },
        label: { type: 'string' as const, required: true, description: '字典标签' },
        value: { type: 'string' as const, required: true, description: '字典值' },
        sort: { type: 'int' as const, default: 0, description: '排序' },
        status: { type: 'int' as const, default: 1, description: '状态' },
      },
      responses: { 200: { id: { type: 'uuid' as const, description: '字典数据 ID' } } },
      openapi: { summary: '创建字典数据', tags: ['dict'], operationId: 'createDictData' },
    },
    async (ctx) => {
      const body = await parseBody(ctx.request);
      try {
        const result = await dictService.createData(body as unknown as CreateDictDataParams);
        return success(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : '创建失败', 400);
      }
    },
    perm('system', 'dict:create'),
  );
  userRouter.put(
    '/api/system/dict/data/:id',
    {
      body: {
        label: { type: 'string' as const, description: '字典标签' },
        value: { type: 'string' as const, description: '字典值' },
        sort: { type: 'int' as const, description: '排序' },
        status: { type: 'int' as const, description: '状态' },
      },
      openapi: { summary: '更新字典数据', tags: ['dict'], operationId: 'updateDictData' },
    },
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      try {
        await dictService.updateData(id, body as Record<string, unknown>);
        return success(null);
      } catch (e) {
        return fail(e instanceof Error ? e.message : '更新失败', 400);
      }
    },
    perm('system', 'dict:update'),
  );
  userRouter.delete(
    '/api/system/dict/data/:id',
    {
      openapi: { summary: '删除字典数据', tags: ['dict'], operationId: 'deleteDictData' },
    },
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      try {
        await dictService.deleteData(id);
        return success(null);
      } catch (e) {
        return fail(e instanceof Error ? e.message : '删除失败', 400);
      }
    },
    perm('system', 'dict:delete'),
  );
  // Batch delete dict data
  userRouter.post(
    '/api/system/dict/data/batch-delete',
    {
      body: { ids: { type: 'array' as const, required: true, description: '字典数据 ID 列表' } },
      openapi: { summary: '批量删除字典数据', tags: ['dict'] },
    },
    async (ctx) => {
      const body = await parseBody(ctx.request);
      const ids = (body.ids as string[]) ?? [];
      let successCount = 0;
      let skipped = 0;
      for (const id of ids) {
        try {
          await dictService.deleteData(id);
          successCount++;
        } catch {
          skipped++;
        }
      }
      return success({ success: successCount, skipped });
    },
    perm('system', 'dict:delete'),
  );

  // === Notice revoke ===
  userRouter.put(
    '/api/system/notices/:id/revoke',
    {
      openapi: { summary: '撤回通知', tags: ['notice'], operationId: 'revokeNotice' },
    },
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      await noticeService.revoke(id);
      return success(null);
    },
    perm('system', 'notice:update'),
  );

  // === User unlock & blacklist ===
  userRouter.put(
    '/api/system/users/:id/unlock',
    {
      openapi: { summary: '解锁用户', tags: ['user'], operationId: 'unlockUser' },
    },
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      await db
        .query(UserModel)
        .where('id', '=', id)
        .update({ locked_until: null, login_attempts: 0 });
      await cache.del(ns.detailKey('user', id));
      return success(null);
    },
    perm('system', 'user:update'),
  );

  userRouter.put(
    '/api/system/users/:id/blacklist',
    {
      body: {
        blacklisted: { type: 'boolean' as const, required: true, description: '是否加入黑名单' },
      },
      openapi: { summary: '设置用户黑名单', tags: ['user'], operationId: 'setUserBlacklist' },
    },
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      const blacklisted = body.blacklisted as boolean;
      await db.query(UserModel).where('id', '=', id).update({ blacklisted });
      await cache.del(ns.detailKey('user', id));
      return success(null);
    },
    perm('system', 'user:update'),
  );

  // Batch delete users
  userRouter.post(
    '/api/system/users/batch-delete',
    {
      body: { ids: { type: 'array' as const, required: true, description: '用户 ID 列表' } },
      openapi: { summary: '批量删除用户', tags: ['user'] },
    },
    async (ctx) => {
      const body = await parseBody(ctx.request);
      const ids = (body.ids as string[]) ?? [];
      const user = ctx.user as { id: string };
      let successCount = 0;
      let skipped = 0;
      for (const id of ids) {
        if (id === user.id) {
          skipped++;
          continue;
        }
        try {
          await userService.delete(id);
          successCount++;
        } catch {
          skipped++;
        }
      }
      return success({ success: successCount, skipped });
    },
    perm('system', 'user:delete'),
  );

  // Batch update user status
  userRouter.post(
    '/api/system/users/batch-status',
    {
      body: {
        ids: { type: 'array' as const, required: true, description: '用户 ID 列表' },
        status: { type: 'int' as const, required: true, description: '目标状态 0=停用 1=正常' },
      },
      openapi: { summary: '批量修改用户状态', tags: ['user'] },
    },
    async (ctx) => {
      const body = await parseBody(ctx.request);
      const ids = (body.ids as string[]) ?? [];
      const targetStatus = body.status as number;
      const user = ctx.user as { id: string };
      let successCount = 0;
      let skipped = 0;
      for (const id of ids) {
        if (id === user.id) {
          skipped++;
          continue;
        }
        const row = await db.query(UserModel).where('id', '=', id).select('status').get();
        if (!row || row.status === targetStatus) {
          skipped++;
          continue;
        }
        await userService.updateStatus(id, targetStatus);
        successCount++;
      }
      return success({ success: successCount, skipped });
    },
    perm('system', 'user:update'),
  );

  // Batch reset user passwords
  userRouter.post(
    '/api/system/users/batch-reset-pwd',
    {
      body: { ids: { type: 'array' as const, required: true, description: '用户 ID 列表' } },
      openapi: { summary: '批量重置用户密码', tags: ['user'] },
    },
    async (ctx) => {
      const body = await parseBody(ctx.request);
      const ids = (body.ids as string[]) ?? [];
      const defaultPwd = (await configService.getValue('sys_user_init_password')) || '123456';
      let successCount = 0;
      let skipped = 0;
      for (const id of ids) {
        try {
          await userService.resetPassword(id, defaultPwd);
          successCount++;
        } catch {
          skipped++;
        }
      }
      return success({ success: successCount, skipped });
    },
    perm('system', 'user:resetPwd'),
  );

  // === User tag association ===
  userRouter.get(
    '/api/system/users/:id/tags',
    {
      responses: { 200: { type: 'array' as const, description: '用户标签列表' } },
      openapi: { summary: '获取用户标签', tags: ['user'], operationId: 'getUserTags' },
    },
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const tags = await tagService.getUserTags(id);
      return success(tags);
    },
    perm('system', 'user:query'),
  );

  userRouter.put(
    '/api/system/users/:id/tags',
    {
      body: {
        tagIds: { type: 'array' as const, required: true, description: '标签 ID 列表' },
      },
      openapi: { summary: '分配用户标签', tags: ['user'], operationId: 'assignUserTags' },
    },
    async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const body = await parseBody(ctx.request);
      const tagIds = (body.tagIds as string[]) ?? [];
      await tagService.assignUserTags(id, tagIds);
      return success(null);
    },
    perm('system', 'user:update'),
  );

  // === Operation logs (read-only) ===
  const opLogPerm = perm('system', 'log:list');
  userRouter.get(
    '/api/system/operation-logs',
    {
      query: {
        page: { type: 'int' as const, default: 1, description: '页码' },
        pageSize: { type: 'int' as const, default: 10, description: '每页数量' },
        username: { type: 'string' as const, description: '用户名筛选' },
        module: { type: 'string' as const, description: '模块筛选' },
      },
      responses: {
        200: {
          list: {
            type: 'array' as const,
            items: { type: 'object' as const },
            description: '操作日志列表',
          },
          total: { type: 'int' as const, description: '总数' },
          page: { type: 'int' as const, description: '当前页' },
          pageSize: { type: 'int' as const, description: '每页数量' },
          totalPages: { type: 'int' as const, description: '总页数' },
        },
      },
      openapi: { summary: '获取操作日志', tags: ['log'], operationId: 'listOperationLogs' },
    },
    async (ctx) => {
      const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
      const q = ctx.query as unknown as Record<string, string>;
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (q.username) {
        conditions.push(`username LIKE $${idx++}`);
        params.push(`%${q.username}%`);
      }
      if (q.module) {
        conditions.push(`module = $${idx++}`);
        params.push(q.module);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const offset = (page - 1) * pageSize;

      const countResult = await db.raw(
        `SELECT COUNT(*) as cnt FROM sys_operation_log ${where}`,
        params,
      );
      const total = Number((countResult as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

      const rows = await db.raw(
        `SELECT id, user_id as "userId", username, module, action, method, url, ip, params, result, error_msg as "errorMsg", duration, created_at as "createdAt" FROM sys_operation_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, pageSize, offset],
      );

      return paginated(rows as unknown[], total, page, pageSize);
    },
    opLogPerm,
  );

  // === Login logs (read-only) ===
  userRouter.get(
    '/api/system/login-logs',
    {
      query: {
        page: { type: 'int' as const, default: 1, description: '页码' },
        pageSize: { type: 'int' as const, default: 10, description: '每页数量' },
        username: { type: 'string' as const, description: '用户名筛选' },
      },
      responses: {
        200: {
          list: {
            type: 'array' as const,
            items: { type: 'object' as const },
            description: '登录日志列表',
          },
          total: { type: 'int' as const, description: '总数' },
          page: { type: 'int' as const, description: '当前页' },
          pageSize: { type: 'int' as const, description: '每页数量' },
          totalPages: { type: 'int' as const, description: '总页数' },
        },
      },
      openapi: { summary: '获取登录日志', tags: ['log'], operationId: 'listLoginLogs' },
    },
    async (ctx) => {
      const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
      const q = ctx.query as unknown as Record<string, string>;
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (q.username) {
        conditions.push(`username LIKE $${idx++}`);
        params.push(`%${q.username}%`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const offset = (page - 1) * pageSize;

      const countResult = await db.raw(
        `SELECT COUNT(*) as cnt FROM sys_login_log ${where}`,
        params,
      );
      const total = Number((countResult as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

      const rows = await db.raw(
        `SELECT id, user_id as "userId", username, ip, location, browser, os, status, message, login_method as "loginMethod", login_at as "loginAt", created_at as "createdAt" FROM sys_login_log ${where} ORDER BY login_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, pageSize, offset],
      );

      return paginated(rows as unknown[], total, page, pageSize);
    },
    opLogPerm,
  );

  userRouter.delete(
    '/api/system/login-logs',
    {
      openapi: { summary: '清空登录日志', tags: ['log'], operationId: 'clearLoginLogs' },
    },
    async () => {
      await db.raw('TRUNCATE TABLE sys_login_log');
      return success(null);
    },
    opLogPerm,
  );

  // === Dashboard stats ===
  userRouter.get(
    '/api/system/dashboard/stats',
    {
      responses: {
        200: {
          userCount: { type: 'int' as const, description: '用户总数' },
          roleCount: { type: 'int' as const, description: '角色总数' },
          todayLogs: { type: 'int' as const, description: '今日操作数' },
          unreadNotices: { type: 'int' as const, description: '未读通知数' },
        },
      },
      openapi: { summary: '获取仪表盘统计', tags: ['dashboard'], operationId: 'getDashboardStats' },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      const userId = user?.id ?? '';

      const [userCount, roleCount, todayLogs, unreadNotices] = await Promise.all([
        db.query(UserModel).count(),
        db
          .raw('SELECT COUNT(*) AS cnt FROM sys_role')
          .then((r) => Number((r as Array<Record<string, unknown>>)[0]?.cnt ?? 0)),
        db
          .raw('SELECT COUNT(*) AS cnt FROM sys_operation_log WHERE created_at >= CURRENT_DATE')
          .then((r) => Number((r as Array<Record<string, unknown>>)[0]?.cnt ?? 0)),
        noticeService.getUnreadCount(userId),
      ]);

      return success({ userCount, roleCount, todayLogs, unreadNotices });
    },
  );

  // === Published notices for current user (with read status) ===
  userRouter.get(
    '/api/system/notices/published',
    {
      responses: {
        200: {
          items: {
            type: 'array' as const,
            items: { type: 'object' as const },
            description: '通知列表',
          },
          total: { type: 'int' as const, description: '总数' },
          page: { type: 'int' as const, description: '当前页' },
          pageSize: { type: 'int' as const, description: '每页条数' },
          totalPages: { type: 'int' as const, description: '总页数' },
        },
      },
      openapi: {
        summary: '获取已发布通知列表（含已读状态）',
        tags: ['notice'],
        operationId: 'listPublishedNotices',
      },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      const userId = user?.id ?? '';
      const query = ctx.url ? new URL(ctx.url).searchParams : new URLSearchParams();
      const page = Number(query.get('page') ?? '1');
      const pageSize = Number(query.get('pageSize') ?? '10');

      const result = await noticeService.listPublishedForUser(userId, { page, pageSize });
      return success(result);
    },
  );

  // === Batch mark notices as read ===
  userRouter.post(
    '/api/system/notices/batch-read',
    {
      body: {
        ids: {
          type: 'array' as const,
          items: { type: 'uuid' as const },
          required: true,
          min: 1,
          max: 100,
          description: '通知 ID 列表',
        },
      },
      responses: {
        200: {
          code: { type: 'int' as const, description: '业务状态码' },
          message: { type: 'string' as const, description: '响应消息' },
        },
      },
      openapi: {
        summary: '批量标记通知已读',
        tags: ['notice'],
        operationId: 'batchMarkNoticeRead',
      },
    },
    async (ctx) => {
      const user = ctx.user as { id: string } | undefined;
      const userId = user?.id ?? '';
      const ids = ctx.body.ids;

      await noticeService.markBatchRead(userId, ids);
      return success(null);
    },
  );

  // Merge userRouter into main router
  router.merge(userRouter);

  return {
    services: {
      auth: authService,
      user: userService,
      role: roleService,
      menu: menuService,
      dept: deptService,
      post: postService,
      dict: dictService,
      config: configService,
      notice: noticeService,
      permissionLoader,
      menuTreeBuilder,
      passkey: passkeyService,
      tag: tagService,
    },
    router,
    async init() {
      await permissionLoader.loadAll();
    },
  };
}
