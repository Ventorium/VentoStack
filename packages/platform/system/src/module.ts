/**
 * @ventostack/system - 模块聚合
 * 一键创建系统管理模块，注册所有 Service、路由和中间件
 */

import { createRouter } from "@ventostack/core";
import type { Router } from "@ventostack/core";
import type { JWTManager, PasswordHasher, TOTPManager, RBAC, RowFilter, AuthSessionManager, TokenRefreshManager, SessionManager, MultiDeviceManager } from "@ventostack/auth";
import type { Cache } from "@ventostack/cache";
import type { AuditStore } from "@ventostack/observability";
import type { EventBus } from "@ventostack/events";

import { createAuthService } from "./services/auth";
import { createUserService } from "./services/user";
import { createRoleService } from "./services/role";
import { createMenuService } from "./services/menu";
import { createDeptService } from "./services/dept";
import { createPostService } from "./services/post";
import { createDictService } from "./services/dict";
import { createConfigService } from "./services/config";
import { createNoticeService } from "./services/notice";
import { createPermissionLoader } from "./services/permission-loader";
import { createMenuTreeBuilder } from "./services/menu-tree-builder";

import { createAuthMiddleware, createPermMiddleware } from "./middlewares/auth-guard";
import { createOperationLogMiddleware } from "./middlewares/operation-log";
import { createAuthRoutes } from "./routes/auth";
import { createUserRoutes } from "./routes/user";
import { createCrudRoutes } from "./routes/crud";
import { ok, okPage, fail, parseBody, pageOf } from "./routes/common";

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
  };
  router: Router;
  init(): Promise<void>;
}

export interface SystemModuleDeps {
  executor: (text: string, params?: unknown[]) => Promise<unknown[]>;
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
}

export function createSystemModule(deps: SystemModuleDeps): SystemModule {
  const { executor, cache, jwt, jwtSecret, passwordHasher, totp, rbac, rowFilter, auditLog, authSessionManager, eventBus } = deps;

  // Services
  const authService = createAuthService({ executor, cache, jwt, jwtSecret, passwordHasher, totp, authSessionManager, auditStore: auditLog, eventBus });
  const userService = createUserService({ executor, passwordHasher, cache });
  const roleService = createRoleService({ executor, cache });
  const menuService = createMenuService({ executor });
  const deptService = createDeptService({ executor });
  const postService = createPostService({ executor });
  const dictService = createDictService({ executor, cache });
  const configService = createConfigService({ executor, cache });
  const noticeService = createNoticeService({ executor });
  const permissionLoader = createPermissionLoader({ executor, rbac, rowFilter });
  const menuTreeBuilder = createMenuTreeBuilder({ executor });

  // Middlewares
  const authMiddleware = createAuthMiddleware(jwt, jwtSecret);
  const perm = createPermMiddleware(rbac);
  const opLogMiddleware = createOperationLogMiddleware(auditLog);

  // Routes
  const router = createRouter();
  router.merge(createAuthRoutes(authService, authMiddleware));
  router.merge(createUserRoutes(userService, authMiddleware, perm));

  // CRUD routes for other entities
  router.merge(createCrudRoutes({
    basePath: "/api/system/roles",
    resource: "system:role",
    service: roleService,
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.put("/api/system/roles/:id/menus", perm("system", "role:update"), async (ctx) => {
        const id = (ctx.params as Record<string, string>).id;
        const body = await parseBody(ctx.request);
        const menuIds = (body.menuIds as string[]) ?? [];
        await roleService.assignMenus(id, menuIds);
        return ok(null);
      });
      r.put("/api/system/roles/:id/data-scope", perm("system", "role:update"), async (ctx) => {
        const id = (ctx.params as Record<string, string>).id;
        const body = await parseBody(ctx.request);
        await roleService.assignDataScope(id, body.scope as number, body.deptIds as string[] | undefined);
        return ok(null);
      });
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
      update: (id: string, body: any) => menuService.update(id, body),
    },
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.get("/api/system/menus/tree", perm("system", "menu:list"), async () => {
        const tree = await menuService.getTree();
        return ok(tree);
      });
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
    },
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.get("/api/system/depts/tree", perm("system", "dept:list"), async () => {
        const tree = await deptService.getTree();
        return ok(tree);
      });
    },
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/posts",
    resource: "system:post",
    service: postService,
    authMiddleware,
    perm,
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/dict/types",
    resource: "system:dict",
    service: {
      ...dictService,
      list: (params: any) => dictService.listTypes(params),
      create: (body: any) => dictService.createType(body),
      update: (idOrCode: string, body: any) => dictService.updateType(idOrCode, body),
      delete: (idOrCode: string) => dictService.deleteType(idOrCode),
      getById: (code: string) => dictService.listTypes({ page: 1, pageSize: 1 }).then(r => r.items[0] ?? null),
    },
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.get("/api/system/dict/types/:code/data", async (ctx) => {
        const code = (ctx.params as Record<string, string>).code;
        const data = await dictService.listDataByType(code);
        return ok(data);
      });
    },
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/configs",
    resource: "system:config",
    service: { ...configService, update: (key: string, body: any) => configService.update(key, body) },
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.get("/api/system/configs/by-key/:key", perm("system", "config:query"), async (ctx) => {
        const key = (ctx.params as Record<string, string>).key;
        const value = await configService.getValue(key);
        if (value === null) return fail("Config not found", 404, 404);
        return ok({ key, value });
      });
    },
  }));

  router.merge(createCrudRoutes({
    basePath: "/api/system/notices",
    resource: "system:notice",
    service: noticeService,
    authMiddleware,
    perm,
    extraRoutes: (r) => {
      r.put("/api/system/notices/:id/publish", perm("system", "notice:update"), async (ctx) => {
        const id = (ctx.params as Record<string, string>).id;
        const user = ctx.user as { id: string };
        await noticeService.publish(id, user.id);
        return ok(null);
      });
      r.put("/api/system/notices/:id/read", async (ctx) => {
        const id = (ctx.params as Record<string, string>).id;
        const user = ctx.user as { id: string };
        await noticeService.markRead(user.id, id);
        return ok(null);
      });
    },
  }));

  // User self-service routes (use sub-router with group auth middleware)
  const userRouter = createRouter();
  userRouter.use(authMiddleware);

  userRouter.get("/api/system/user/profile", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);
    const detail = await userService.getById(user.id);
    if (!detail) return ok(null);
    const permissions = await menuTreeBuilder.buildPermissionsForUser(user.id);
    const roles = ((detail as Record<string, unknown>).roles as Array<{ code: string }>) ?? [];
    return ok({
      ...detail,
      roles: roles.map((r: { code: string }) => r.code),
      permissions,
    });
  });

  userRouter.get("/api/system/user/routes", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);
    const tree = await menuTreeBuilder.buildRoutesForUser(user.id);
    return ok(tree);
  });

  userRouter.get("/api/system/user/permissions", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);
    const permissions = await menuTreeBuilder.buildPermissionsForUser(user.id);
    return ok(permissions);
  });

  // === Dict data CRUD ===
  userRouter.post("/api/system/dict/data", perm("system", "dict:create"), async (ctx) => {
    const body = await parseBody(ctx.request);
    const result = await dictService.createData(body as any);
    return ok(result);
  });
  userRouter.put("/api/system/dict/data/:id", perm("system", "dict:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    const body = await parseBody(ctx.request);
    await dictService.updateData(id, body as any);
    return ok(null);
  });
  userRouter.delete("/api/system/dict/data/:id", perm("system", "dict:delete"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    await dictService.deleteData(id);
    return ok(null);
  });

  // === Notice revoke ===
  userRouter.put("/api/system/notices/:id/revoke", perm("system", "notice:update"), async (ctx) => {
    const id = (ctx.params as Record<string, string>).id;
    await noticeService.revoke(id);
    return ok(null);
  });

  // === Operation logs (read-only) ===
  const opLogPerm = perm("system", "log:list");
  userRouter.get("/api/system/operation-logs", opLogPerm, async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.username) { conditions.push(`username LIKE $${idx++}`); params.push(`%${q.username}%`); }
    if (q.module) { conditions.push(`module = $${idx++}`); params.push(q.module); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const countResult = await executor(`SELECT COUNT(*) as cnt FROM sys_operation_log ${where}`, params);
    const total = Number((countResult as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const rows = await executor(
      `SELECT * FROM sys_operation_log ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset],
    );

    return okPage(rows as any[], total, page, pageSize);
  });

  // === Login logs (read-only) ===
  userRouter.get("/api/system/login-logs", opLogPerm, async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const q = ctx.query as Record<string, string>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q.username) { conditions.push(`username LIKE $${idx++}`); params.push(`%${q.username}%`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const countResult = await executor(`SELECT COUNT(*) as cnt FROM sys_login_log ${where}`, params);
    const total = Number((countResult as Array<Record<string, unknown>>)[0]?.cnt ?? 0);

    const rows = await executor(
      `SELECT * FROM sys_login_log ${where} ORDER BY login_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, pageSize, offset],
    );

    return okPage(rows as any[], total, page, pageSize);
  });

  // === Dashboard stats ===
  userRouter.get("/api/system/dashboard/stats", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    const userId = user?.id ?? "";

    const [userCount, roleCount, todayLogs, unreadNotices] = await Promise.all([
      executor("SELECT COUNT(*) AS cnt FROM sys_user WHERE deleted_at IS NULL").then(r => Number((r as Array<Record<string, unknown>>)[0]?.cnt ?? 0)),
      executor("SELECT COUNT(*) AS cnt FROM sys_role").then(r => Number((r as Array<Record<string, unknown>>)[0]?.cnt ?? 0)),
      executor("SELECT COUNT(*) AS cnt FROM sys_operation_log WHERE created_at >= CURRENT_DATE").then(r => Number((r as Array<Record<string, unknown>>)[0]?.cnt ?? 0)),
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
      notice: noticeService, permissionLoader, menuTreeBuilder,
    },
    router,
    async init() {
      await permissionLoader.loadAll();
    },
  };
}
