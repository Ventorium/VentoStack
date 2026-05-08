/**
 * @ventostack/system - 模块聚合
 * 一键创建系统管理模块，注册所有 Service、路由和中间件
 */

import { createRouter } from "@ventostack/core";
import type { Router, RouteSchemaConfig } from "@ventostack/core";
import type { JWTManager, PasswordHasher, TOTPManager, RBAC, RowFilter, AuthSessionManager, TokenRefreshManager, SessionManager, MultiDeviceManager } from "@ventostack/auth";
import type { Cache } from "@ventostack/cache";
import type { AuditStore } from "@ventostack/observability";
import type { EventBus } from "@ventostack/events";
import type { Database } from "@ventostack/database";

import { createAuthService } from "./services/auth";
import { createUserService } from "./services/user";
import type { UpdateUserParams } from "./services/user";
import { createRoleService } from "./services/role";
import type { CreateRoleParams } from "./services/role";
import { createMenuService } from "./services/menu";
import type { CreateMenuParams } from "./services/menu";
import { createDeptService } from "./services/dept";
import type { CreateDeptParams, UpdateDeptParams } from "./services/dept";
import { createPostService } from "./services/post";
import type { CreatePostParams, UpdatePostParams } from "./services/post";
import { createDictService } from "./services/dict";
import type { CreateDictTypeParams, CreateDictDataParams } from "./services/dict";
import { createConfigService } from "./services/config";
import type { CreateConfigParams } from "./services/config";
import { createNoticeService } from "./services/notice";
import type { CreateNoticeParams, UpdateNoticeParams } from "./services/notice";
import { createPermissionLoader } from "./services/permission-loader";
import { createMenuTreeBuilder } from "./services/menu-tree-builder";
import { createPasskeyService } from "./services/passkey";
import { UserModel } from "./models/user";
import { OperationLogModel, LoginLogModel } from "./models/log";

import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
import { createOperationLogMiddleware } from "./middlewares/operation-log";
import { createAuthRoutes } from "./routes/auth";
import { createPasskeyRoutes } from "./routes/passkey";
import { createUserRoutes } from "./routes/user";
import { createCrudRoutes } from "./routes/crud";
import { ok, okPage, fail, parseBody, pageOf } from "./routes/common";
import { validatePassword } from "./services/password-policy";

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
  };
  router: Router;
  init(): Promise<void>;
}

export interface FileUploader {
  upload(filename: string, data: Buffer, contentType: string, bucket: string, uploaderId: string): Promise<string>;
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
}

export function createSystemModule(deps: SystemModuleDeps): SystemModule {
  const { db, cache, jwt, jwtSecret, passwordHasher, totp, rbac, rowFilter, auditLog, authSessionManager, eventBus, fileUploader } = deps;

  // Services
  const configService = createConfigService({ db, cache });
  const authService = createAuthService({ db, cache, jwt, jwtSecret, passwordHasher, totp, authSessionManager, auditStore: auditLog, eventBus, configService });
  const userService = createUserService({ db, passwordHasher, cache, configService });
  const roleService = createRoleService({ db, cache });
  const menuService = createMenuService({ db });
  const deptService = createDeptService({ db });
  const postService = createPostService({ db });
  const dictService = createDictService({ db, cache });
  const noticeService = createNoticeService({ db });
  const permissionLoader = createPermissionLoader({ db, rbac, rowFilter });
  const menuTreeBuilder = createMenuTreeBuilder({ db });
  const passkeyService = createPasskeyService({
    db, cache,
    rpID: deps.rpID ?? "localhost",
    rpName: deps.rpName ?? "VentoStack Admin",
    rpOrigins: deps.rpOrigins ?? ["http://localhost:5173"],
    auditStore: auditLog,
  });

  // Middlewares
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);
  const opLogMiddleware = createOperationLogMiddleware(auditLog);

  // Routes
  const router = createRouter();

  // ---- 公开配置接口（无需认证） ----
  router.get("/api/system/configs/public", {
    responses: {
      200: {
        siteName: { type: "string" as const, description: "站点名称" },
        theme: { type: "string" as const, description: "主题" },
        deptEnabled: { type: "boolean" as const, description: "是否启用部门" },
        mfaEnabled: { type: "boolean" as const, description: "是否启用 MFA" },
        mfaForce: { type: "boolean" as const, description: "是否强制 MFA" },
        passkeyEnabled: { type: "boolean" as const, description: "是否启用 Passkey" },
      },
    },
    openapi: { summary: "获取公开配置", tags: ["config"], operationId: "getPublicConfig" },
  }, async () => {
    const [siteName, theme, deptEnabled, mfaEnabled, mfaForce, passkeyEnabled] = await Promise.all([
      configService.getValue("sys_site_name"),
      configService.getValue("sys_theme"),
      configService.getValue("sys_dept_enabled"),
      configService.getValue("sys_mfa_enabled"),
      configService.getValue("sys_mfa_force"),
      configService.getValue("sys_passkey_enabled"),
    ]);
    return ok({
      siteName: siteName ?? "VentoStack",
      theme: theme ?? "light",
      deptEnabled: deptEnabled !== "false",
      mfaEnabled: mfaEnabled === "true",
      mfaForce: mfaForce === "true",
      passkeyEnabled: passkeyEnabled !== "false",
    });
  });

  router.merge(createAuthRoutes(authService, authMiddleware));
  router.merge(createPasskeyRoutes(passkeyService, authService, authMiddleware, cache));
  router.merge(createUserRoutes(userService, authMiddleware, perm));

  // CRUD routes for other entities
  router.merge(createCrudRoutes({
    basePath: "/api/system/roles",
    resource: "system:role",
    service: {
      ...roleService,
      create: (body) => roleService.create(body as CreateRoleParams),
      update: (id, body) => roleService.update(id, body as Partial<CreateRoleParams>),
    },
    authMiddleware,
    perm,
    schemas: {
      item: {
        id: { type: "uuid" as const, description: "角色 ID" },
        name: { type: "string" as const, description: "角色名称" },
        code: { type: "string" as const, description: "角色编码" },
        sort: { type: "int" as const, description: "排序" },
        status: { type: "int" as const, description: "状态" },
        remark: { type: "string" as const, description: "备注" },
        createdAt: { type: "date" as const, description: "创建时间" },
      },
      createBody: {
        name: { type: "string" as const, required: true, description: "角色名称" },
        code: { type: "string" as const, required: true, description: "角色编码" },
        sort: { type: "int" as const, default: 0, description: "排序" },
        status: { type: "int" as const, default: 1, description: "状态" },
        remark: { type: "string" as const, description: "备注" },
      },
      updateBody: {
        name: { type: "string" as const, description: "角色名称" },
        code: { type: "string" as const, description: "角色编码" },
        sort: { type: "int" as const, description: "排序" },
        status: { type: "int" as const, description: "状态" },
        remark: { type: "string" as const, description: "备注" },
      },
    },
    extraRoutes: (r) => {
      r.put("/api/system/roles/:id/menus", {
        body: { menuIds: { type: "array" as const, required: true, description: "菜单 ID 列表" } },
        openapi: { summary: "分配角色菜单", tags: ["role"], operationId: "assignRoleMenus" },
      }, async (ctx) => {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const menuIds = (body.menuIds as string[]) ?? [];
        await roleService.assignMenus(id, menuIds);
        return ok(null);
      }, perm("system", "role:update"));
      r.put("/api/system/roles/:id/data-scope", {
        body: {
          scope: { type: "int" as const, required: true, description: "数据范围" },
          deptIds: { type: "array" as const, description: "部门 ID 列表" },
        },
        openapi: { summary: "分配角色数据范围", tags: ["role"], operationId: "assignRoleDataScope" },
      }, async (ctx) => {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        await roleService.assignDataScope(id, body.scope as number, body.deptIds as string[] | undefined);
        return ok(null);
      }, perm("system", "role:update"));
    },
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/menus",
    resource: "system:menu",
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
    schemas: {
      item: {
        id: { type: "uuid" as const, description: "菜单 ID" },
        parentId: { type: "uuid" as const, description: "父菜单 ID" },
        name: { type: "string" as const, description: "菜单名称" },
        path: { type: "string" as const, description: "路由路径" },
        component: { type: "string" as const, description: "组件路径" },
        icon: { type: "string" as const, description: "图标" },
        sort: { type: "int" as const, description: "排序" },
        type: { type: "string" as const, description: "菜单类型" },
        visible: { type: "int" as const, description: "是否可见" },
        status: { type: "int" as const, description: "状态" },
        permission: { type: "string" as const, description: "权限标识" },
      },
      createBody: {
        parentId: { type: "uuid" as const, description: "父菜单 ID" },
        name: { type: "string" as const, required: true, description: "菜单名称" },
        path: { type: "string" as const, description: "路由路径" },
        component: { type: "string" as const, description: "组件路径" },
        icon: { type: "string" as const, description: "图标" },
        sort: { type: "int" as const, default: 0, description: "排序" },
        type: { type: "string" as const, required: true, enum: ["D", "M", "B"], description: "类型 D=目录 M=菜单 B=按钮" },
        visible: { type: "int" as const, default: 1, description: "是否可见" },
        status: { type: "int" as const, default: 1, description: "状态" },
        permission: { type: "string" as const, description: "权限标识" },
      },
      updateBody: {
        parentId: { type: "uuid" as const, description: "父菜单 ID" },
        name: { type: "string" as const, description: "菜单名称" },
        path: { type: "string" as const, description: "路由路径" },
        component: { type: "string" as const, description: "组件路径" },
        icon: { type: "string" as const, description: "图标" },
        sort: { type: "int" as const, description: "排序" },
        type: { type: "string" as const, enum: ["D", "M", "B"], description: "类型" },
        visible: { type: "int" as const, description: "是否可见" },
        status: { type: "int" as const, description: "状态" },
        permission: { type: "string" as const, description: "权限标识" },
      },
    },
    extraRoutes: (r) => {
      r.get("/api/system/menus/tree", {
        responses: { 200: { type: "array" as const, description: "菜单树" } },
        openapi: { summary: "获取菜单树", tags: ["menu"], operationId: "getMenuTree" },
      }, async () => {
        const tree = await menuService.getTree();
        return ok(tree);
      }, perm("system", "menu:list"));
    },
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/depts",
    resource: "system:dept",
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
    schemas: {
      item: {
        id: { type: "uuid" as const, description: "部门 ID" },
        parentId: { type: "uuid" as const, description: "父部门 ID" },
        name: { type: "string" as const, description: "部门名称" },
        sort: { type: "int" as const, description: "排序" },
        leader: { type: "string" as const, description: "负责人" },
        phone: { type: "string" as const, description: "联系电话" },
        email: { type: "string" as const, description: "邮箱" },
        status: { type: "int" as const, description: "状态" },
      },
      createBody: {
        parentId: { type: "uuid" as const, description: "父部门 ID" },
        name: { type: "string" as const, required: true, description: "部门名称" },
        sort: { type: "int" as const, default: 0, description: "排序" },
        leader: { type: "string" as const, description: "负责人" },
        phone: { type: "string" as const, description: "联系电话" },
        email: { type: "string" as const, format: "email", description: "邮箱" },
        status: { type: "int" as const, default: 1, description: "状态" },
      },
      updateBody: {
        parentId: { type: "uuid" as const, description: "父部门 ID" },
        name: { type: "string" as const, description: "部门名称" },
        sort: { type: "int" as const, description: "排序" },
        leader: { type: "string" as const, description: "负责人" },
        phone: { type: "string" as const, description: "联系电话" },
        email: { type: "string" as const, format: "email", description: "邮箱" },
        status: { type: "int" as const, description: "状态" },
      },
    },
    extraRoutes: (r) => {
      r.get("/api/system/depts/tree", {
        responses: { 200: { type: "array" as const, description: "部门树" } },
        openapi: { summary: "获取部门树", tags: ["dept"], operationId: "getDeptTree" },
      }, async () => {
        const tree = await deptService.getTree();
        return ok(tree);
      }, perm("system", "dept:list"));
    },
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/posts",
    resource: "system:post",
    service: {
      ...postService,
      create: (body) => postService.create(body as CreatePostParams),
      update: (id, body) => postService.update(id, body as UpdatePostParams),
    },
    authMiddleware,
    perm,
    schemas: {
      item: {
        id: { type: "uuid" as const, description: "岗位 ID" },
        name: { type: "string" as const, description: "岗位名称" },
        code: { type: "string" as const, description: "岗位编码" },
        sort: { type: "int" as const, description: "排序" },
        status: { type: "int" as const, description: "状态" },
        remark: { type: "string" as const, description: "备注" },
      },
      createBody: {
        name: { type: "string" as const, required: true, description: "岗位名称" },
        code: { type: "string" as const, required: true, description: "岗位编码" },
        sort: { type: "int" as const, default: 0, description: "排序" },
        status: { type: "int" as const, default: 1, description: "状态" },
        remark: { type: "string" as const, description: "备注" },
      },
      updateBody: {
        name: { type: "string" as const, description: "岗位名称" },
        code: { type: "string" as const, description: "岗位编码" },
        sort: { type: "int" as const, description: "排序" },
        status: { type: "int" as const, description: "状态" },
        remark: { type: "string" as const, description: "备注" },
      },
    },
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/dict/types",
    resource: "system:dict",
    service: {
      ...dictService,
      list: (params) => dictService.listTypes(params),
      create: (body) => dictService.createType(body as CreateDictTypeParams),
      update: (idOrCode, body) => dictService.updateType(idOrCode, body as Record<string, unknown>),
      delete: (idOrCode) => dictService.deleteType(idOrCode),
      getById: (code) => dictService.listTypes({ page: 1, pageSize: 1 }).then(r => r.items[0] ?? null),
    },
    authMiddleware,
    perm,
    schemas: {
      item: {
        id: { type: "uuid" as const, description: "字典类型 ID" },
        name: { type: "string" as const, description: "字典名称" },
        code: { type: "string" as const, description: "字典编码" },
        status: { type: "int" as const, description: "状态" },
        remark: { type: "string" as const, description: "备注" },
      },
      createBody: {
        name: { type: "string" as const, required: true, description: "字典名称" },
        code: { type: "string" as const, required: true, description: "字典编码" },
        status: { type: "int" as const, default: 1, description: "状态" },
        remark: { type: "string" as const, description: "备注" },
      },
      updateBody: {
        name: { type: "string" as const, description: "字典名称" },
        code: { type: "string" as const, description: "字典编码" },
        status: { type: "int" as const, description: "状态" },
        remark: { type: "string" as const, description: "备注" },
      },
    },
    extraRoutes: (r) => {
      r.get("/api/system/dict/types/:code/data", {
        responses: {
          200: {
            type: "array",
            description: "字典数据列表",
          },
        },
        openapi: { summary: "获取字典数据", tags: ["dict"], operationId: "getDictData" },
      }, async (ctx) => {
        const code = (ctx.params as Record<string, string>).code!;
        const data = await dictService.listDataByType(code);
        return ok(data);
      });
    },
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/configs",
    resource: "system:config",
    service: {
      ...configService,
      create: (body) => configService.create(body as CreateConfigParams),
      update: (key, body) => configService.update(key, body as Record<string, unknown>),
    },
    authMiddleware,
    perm,
    schemas: {
      item: {
        id: { type: "uuid" as const, description: "配置 ID" },
        name: { type: "string" as const, description: "配置名称" },
        key: { type: "string" as const, description: "配置键" },
        value: { type: "string" as const, description: "配置值" },
        type: { type: "string" as const, description: "配置类型" },
        remark: { type: "string" as const, description: "备注" },
      },
      createBody: {
        name: { type: "string" as const, required: true, description: "配置名称" },
        key: { type: "string" as const, required: true, description: "配置键" },
        value: { type: "string" as const, required: true, description: "配置值" },
        type: { type: "string" as const, description: "配置类型" },
        remark: { type: "string" as const, description: "备注" },
      },
      updateBody: {
        name: { type: "string" as const, description: "配置名称" },
        value: { type: "string" as const, description: "配置值" },
        type: { type: "string" as const, description: "配置类型" },
        remark: { type: "string" as const, description: "备注" },
      },
    },
    extraRoutes: (r) => {
      r.get("/api/system/configs/by-key/:key", {
        responses: {
          200: {
            key: { type: "string" as const, description: "配置键" },
            value: { type: "string" as const, description: "配置值" },
          },
        },
        openapi: { summary: "按 key 获取配置", tags: ["config"], operationId: "getConfigByKey" },
      }, async (ctx) => {
        const key = (ctx.params as Record<string, string>).key!;
        const value = await configService.getValue(key);
        if (value === null) return fail("Config not found", 404, 404);
        return ok({ key, value });
      }, perm("system", "config:query"));
    },
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/notices",
    resource: "system:notice",
    service: {
      ...noticeService,
      create: (body) => noticeService.create(body as CreateNoticeParams),
      update: (id, body) => noticeService.update(id, body as UpdateNoticeParams),
    },
    authMiddleware,
    perm,
    schemas: {
      item: {
        id: { type: "uuid" as const, description: "通知 ID" },
        title: { type: "string" as const, description: "通知标题" },
        content: { type: "string" as const, description: "通知内容" },
        type: { type: "string" as const, description: "通知类型" },
        status: { type: "int" as const, description: "状态" },
        createdAt: { type: "date" as const, description: "创建时间" },
      },
      createBody: {
        title: { type: "string" as const, required: true, description: "通知标题" },
        content: { type: "string" as const, required: true, description: "通知内容" },
        type: { type: "string" as const, required: true, description: "通知类型" },
      },
      updateBody: {
        title: { type: "string" as const, description: "通知标题" },
        content: { type: "string" as const, description: "通知内容" },
        type: { type: "string" as const, description: "通知类型" },
      },
    },
    extraRoutes: (r) => {
      r.put("/api/system/notices/:id/publish", {
        openapi: { summary: "发布通知", tags: ["notice"], operationId: "publishNotice" },
      }, async (ctx) => {
        const id = (ctx.params as Record<string, string>).id!;
        const user = ctx.user as { id: string };
        await noticeService.publish(id, user.id);
        return ok(null);
      }, perm("system", "notice:update"));
      r.put("/api/system/notices/:id/read", {
        openapi: { summary: "标记已读", tags: ["notice"], operationId: "markNoticeRead" },
      }, async (ctx) => {
        const id = (ctx.params as Record<string, string>).id!;
        const user = ctx.user as { id: string };
        await noticeService.markRead(user.id, id);
        return ok(null);
      });
    },
  }));

  // User self-service routes (use sub-router with group auth middleware)
  const userRouter = createRouter();
  userRouter.use(authMiddleware);
  userRouter.use(opLogMiddleware);

  userRouter.get("/api/system/user/profile", {
    responses: {
      200: {
        id: { type: "uuid" as const, description: "用户 ID" },
        username: { type: "string" as const, description: "用户名" },
        nickname: { type: "string" as const, description: "昵称" },
        email: { type: "string" as const, description: "邮箱" },
        phone: { type: "string" as const, description: "手机号" },
        avatar: { type: "string" as const, description: "头像" },
        roles: { type: "array" as const, description: "角色编码列表" },
        permissions: { type: "array" as const, description: "权限列表" },
      },
    },
    openapi: { summary: "获取当前用户信息", tags: ["user"], operationId: "getUserProfile" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("未登录", 401, 401);
    const detail = await userService.getById(user.id);
    if (!detail) return ok(null);
    const permissions = await menuTreeBuilder.buildPermissionsForUser(user.id);
    const roles = ((detail as unknown as Record<string, unknown>).roles as Array<{ code: string }>) ?? [];
    return ok({
      ...detail,
      roles: roles.map((r: { code: string }) => r.code),
      permissions,
    });
  });

  userRouter.get("/api/system/user/routes", {
    responses: { 200: { type: "array" as const, description: "路由树" } },
    openapi: { summary: "获取当前用户路由", tags: ["user"], operationId: "getUserRoutes" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("未登录", 401, 401);
    const tree = await menuTreeBuilder.buildRoutesForUser(user.id);
    return ok(tree);
  });

  userRouter.get("/api/system/user/permissions", {
    responses: { 200: { type: "array" as const, description: "权限列表" } },
    openapi: { summary: "获取当前用户权限", tags: ["user"], operationId: "getUserPermissions" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("未登录", 401, 401);
    const permissions = await menuTreeBuilder.buildPermissionsForUser(user.id);
    return ok(permissions);
  });

  // === User profile self-service ===
  userRouter.put("/api/system/user/profile", {
    body: {
      nickname: { type: "string" as const, description: "昵称" },
      email: { type: "string" as const, format: "email", description: "邮箱" },
      phone: { type: "string" as const, description: "手机号" },
      gender: { type: "string" as const, description: "性别 male/female/unknown" },
    },
    openapi: { summary: "更新当前用户信息", tags: ["user"], operationId: "updateUserProfile" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("未登录", 401, 401);
    const body = await parseBody(ctx.request);
    const { nickname, email, phone, gender } = body as { nickname?: string; email?: string; phone?: string; gender?: number | string };
    const updates: Record<string, unknown> = {};
    if (nickname !== undefined) updates.nickname = nickname;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (gender !== undefined) {
      // 兼容前端字符串和数字：male/female/unknown → 1/2/0
      const genderMap: Record<string, number> = { unknown: 0, male: 1, female: 2 };
      const genderVal = typeof gender === "string" ? (genderMap[gender] ?? Number(gender)) : gender;
      if (!Number.isNaN(genderVal)) updates.gender = genderVal;
    }
    await userService.update(user.id, updates as UpdateUserParams);
    return ok(null);
  });

  userRouter.put("/api/system/user/profile/password", {
    body: {
      oldPassword: { type: "string" as const, required: true, description: "旧密码" },
      newPassword: { type: "string" as const, required: true, min: 6, description: "新密码" },
    },
    openapi: { summary: "修改密码", tags: ["user"], operationId: "changePassword" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("未登录", 401, 401);
    const body = await parseBody(ctx.request);
    const { oldPassword, newPassword } = body as { oldPassword?: string; newPassword?: string };
    if (!oldPassword || !newPassword) return fail("缺少必填参数", 400, 400);

    // 验证旧密码
    const profile = await db.query(UserModel)
      .where("id", "=", user.id)
      .select("password_hash")
      .get();
    if (!profile) return fail("用户不存在", 404, 404);

    const matched = await deps.passwordHasher.verify(oldPassword, profile.password_hash);
    if (!matched) return fail("旧密码错误", 400, 400);

    // 密码策略校验
    const minLength = Number(await configService.getValue("sys_password_min_length")) || 6;
    const complexity = (await configService.getValue("sys_password_complexity")) as "low" | "medium" | "high" || "low";
    const validation = validatePassword(newPassword, { minLength, complexity });
    if (!validation.valid) return fail(validation.message, 400, 400);

    const hash = await deps.passwordHasher.hash(newPassword);
    await db.query(UserModel).where("id", "=", user.id).update({
      password_hash: hash,
      password_changed_at: new Date(),
    });
    await cache.del(`user:detail:${user.id}`);
    return ok(null);
  });

  userRouter.post("/api/system/user/profile/avatar", {
    formData: {
      file: { type: "file" as const, required: true, description: "头像文件" },
    },
    responses: { 200: { avatar: { type: "string" as const, description: "头像 URL" } } },
    openapi: { summary: "上传头像", tags: ["user"], operationId: "uploadAvatar" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("未登录", 401, 401);

    const contentType = ctx.request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return fail("仅支持 multipart/form-data", 400, 400);
    }

    const formData = await ctx.request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return fail("请上传文件", 400, 400);
    }

    // 限制文件大小 (2MB) 和类型
    if (file.size > 2 * 1024 * 1024) return fail("文件大小不能超过2MB", 400, 400);
    const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) return fail("仅支持 PNG/JPG/GIF/WEBP 格式", 400, 400);

    const arrayBuffer = await file.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    let avatarUrl: string;

    if (fileUploader) {
      // 使用文件存储服务（本地 / S3）
      avatarUrl = await fileUploader.upload(file.name, data, file.type, "avatars", user.id);
    } else {
      // 兜底：base64 存入数据库
      avatarUrl = `data:${file.type};base64,${data.toString("base64")}`;
    }

    await db.query(UserModel).where("id", "=", user.id).update({ avatar: avatarUrl });
    await cache.del(`user:detail:${user.id}`);
    return ok({ avatar: avatarUrl });
  });

  // === MFA status ===
  userRouter.get("/api/auth/mfa/status", {
    responses: { 200: { enabled: { type: "boolean" as const, description: "MFA 是否启用" } } },
    openapi: { summary: "获取 MFA 状态", tags: ["auth"], operationId: "getMFAStatus" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("未登录", 401, 401);
    const mfaUser = await db.query(UserModel)
      .where("id", "=", user.id)
      .select("mfa_enabled")
      .get();
    if (!mfaUser) return fail("用户不存在", 404, 404);
    return ok({ enabled: mfaUser.mfa_enabled });
  });

  // === Dict data CRUD ===
  userRouter.post("/api/system/dict/data", {
    body: {
      dictType: { type: "string" as const, required: true, description: "字典类型编码" },
      label: { type: "string" as const, required: true, description: "字典标签" },
      value: { type: "string" as const, required: true, description: "字典值" },
      sort: { type: "int" as const, default: 0, description: "排序" },
      status: { type: "int" as const, default: 1, description: "状态" },
    },
    responses: { 200: { id: { type: "uuid" as const, description: "字典数据 ID" } } },
    openapi: { summary: "创建字典数据", tags: ["dict"], operationId: "createDictData" },
  }, async (ctx) => {
    const body = await parseBody(ctx.request);
    const result = await dictService.createData(body as unknown as CreateDictDataParams);
    return ok(result);
  }, perm("system", "dict:create"));
  userRouter.put("/api/system/dict/data/:id", {
    body: {
      label: { type: "string" as const, description: "字典标签" },
      value: { type: "string" as const, description: "字典值" },
      sort: { type: "int" as const, description: "排序" },
      status: { type: "int" as const, description: "状态" },
    },
    openapi: { summary: "更新字典数据", tags: ["dict"], operationId: "updateDictData" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await dictService.updateData(id, body as Record<string, unknown>);
    return ok(null);
  }, perm("system", "dict:update"));
  userRouter.delete("/api/system/dict/data/:id", {
    openapi: { summary: "删除字典数据", tags: ["dict"], operationId: "deleteDictData" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await dictService.deleteData(id);
    return ok(null);
  }, perm("system", "dict:delete"));

  // === Notice revoke ===
  userRouter.put("/api/system/notices/:id/revoke", {
    openapi: { summary: "撤回通知", tags: ["notice"], operationId: "revokeNotice" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await noticeService.revoke(id);
    return ok(null);
  }, perm("system", "notice:update"));

  // === User unlock & blacklist ===
  userRouter.put("/api/system/users/:id/unlock", {
    openapi: { summary: "解锁用户", tags: ["user"], operationId: "unlockUser" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await db.query(UserModel).where("id", "=", id).update({ locked_until: null, login_attempts: 0 });
    await cache.del(`user:detail:${id}`);
    return ok(null);
  }, perm("system", "user:update"));

  userRouter.put("/api/system/users/:id/blacklist", {
    body: { blacklisted: { type: "boolean" as const, required: true, description: "是否加入黑名单" } },
    openapi: { summary: "设置用户黑名单", tags: ["user"], operationId: "setUserBlacklist" },
  }, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    const blacklisted = body.blacklisted as boolean;
    await db.query(UserModel).where("id", "=", id).update({ blacklisted });
    await cache.del(`user:detail:${id}`);
    return ok(null);
  }, perm("system", "user:update"));

  // === Operation logs (read-only) ===
  const opLogPerm = perm("system", "log:list");
  userRouter.get("/api/system/operation-logs", {
    query: {
      page: { type: "int" as const, default: 1, description: "页码" },
      pageSize: { type: "int" as const, default: 10, description: "每页数量" },
      username: { type: "string" as const, description: "用户名筛选" },
      module: { type: "string" as const, description: "模块筛选" },
    },
    responses: {
      200: {
        list: { type: "array" as const, description: "操作日志列表" },
        total: { type: "int" as const, description: "总数" },
        page: { type: "int" as const, description: "当前页" },
        pageSize: { type: "int" as const, description: "每页数量" },
        totalPages: { type: "int" as const, description: "总页数" },
      },
    },
    openapi: { summary: "获取操作日志", tags: ["log"], operationId: "listOperationLogs" },
  }, async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as unknown as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.username) { conditions.push(`username LIKE $${idx++}`); params.push(`%${q.username}%`); }
    if (q.module) { conditions.push(`module = $${idx++}`); params.push(q.module); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const countResult = await db.raw(`SELECT COUNT(*) as cnt FROM sys_operation_log ${where}`, params);
    const total = Number((countResult as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const rows = await db.raw(
      `SELECT * FROM sys_operation_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset],
    );

    return okPage(rows as unknown[], total, page, pageSize);
  }, opLogPerm);

  // === Login logs (read-only) ===
  userRouter.get("/api/system/login-logs", {
    query: {
      page: { type: "int" as const, default: 1, description: "页码" },
      pageSize: { type: "int" as const, default: 10, description: "每页数量" },
      username: { type: "string" as const, description: "用户名筛选" },
    },
    responses: {
      200: {
        list: { type: "array" as const, description: "登录日志列表" },
        total: { type: "int" as const, description: "总数" },
        page: { type: "int" as const, description: "当前页" },
        pageSize: { type: "int" as const, description: "每页数量" },
        totalPages: { type: "int" as const, description: "总页数" },
      },
    },
    openapi: { summary: "获取登录日志", tags: ["log"], operationId: "listLoginLogs" },
  }, async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as unknown as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.username) { conditions.push(`username LIKE $${idx++}`); params.push(`%${q.username}%`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const countResult = await db.raw(`SELECT COUNT(*) as cnt FROM sys_login_log ${where}`, params);
    const total = Number((countResult as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const rows = await db.raw(
      `SELECT * FROM sys_login_log ${where} ORDER BY login_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset],
    );

    return okPage(rows as unknown[], total, page, pageSize);
  }, opLogPerm);

  userRouter.delete("/api/system/login-logs", {
    openapi: { summary: "清空登录日志", tags: ["log"], operationId: "clearLoginLogs" },
  }, async () => {
    await db.raw(`TRUNCATE TABLE sys_login_log`);
    return ok(null);
  }, opLogPerm);

  // === Dashboard stats ===
  userRouter.get("/api/system/dashboard/stats", {
    responses: {
      200: {
        userCount: { type: "int" as const, description: "用户总数" },
        roleCount: { type: "int" as const, description: "角色总数" },
        todayLogs: { type: "int" as const, description: "今日操作数" },
        unreadNotices: { type: "int" as const, description: "未读通知数" },
      },
    },
    openapi: { summary: "获取仪表盘统计", tags: ["dashboard"], operationId: "getDashboardStats" },
  }, async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    const userId = user?.id ?? "";

    const [userCount, roleCount, todayLogs, unreadNotices] = await Promise.all([
      db.query(UserModel).count(),
      db.raw("SELECT COUNT(*) AS cnt FROM sys_role").then(r => Number((r as Array<Record<string, unknown>>)[0]?.cnt ?? 0)),
      db.raw("SELECT COUNT(*) AS cnt FROM sys_operation_log WHERE created_at >= CURRENT_DATE").then(r => Number((r as Array<Record<string, unknown>>)[0]?.cnt ?? 0)),
      noticeService.getUnreadCount(userId),
    ]);

    return ok({ userCount, roleCount, todayLogs, unreadNotices });
  });

  // Merge userRouter into main router
  router.merge(userRouter);

  return {
    services: {
      auth: authService, user: userService, role: roleService, menu: menuService,
      dept: deptService, post: postService, dict: dictService, config: configService,
      notice: noticeService, permissionLoader, menuTreeBuilder, passkey: passkeyService,
    },
    router,
    async init() {
      await permissionLoader.loadAll();
    },
  };
}
