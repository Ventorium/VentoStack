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
  rpID?: string;
  rpName?: string;
  rpOrigins?: string[];
  fileUploader?: FileUploader;
}

export function createSystemModule(deps: SystemModuleDeps): SystemModule {
  const { executor, cache, jwt, jwtSecret, passwordHasher, totp, rbac, rowFilter, auditLog, authSessionManager, eventBus, fileUploader } = deps;

  // Services
  const configService = createConfigService({ executor, cache });
  const authService = createAuthService({ executor, cache, jwt, jwtSecret, passwordHasher, totp, authSessionManager, auditStore: auditLog, eventBus, configService });
  const userService = createUserService({ executor, passwordHasher, cache, configService });
  const roleService = createRoleService({ executor, cache });
  const menuService = createMenuService({ executor });
  const deptService = createDeptService({ executor });
  const postService = createPostService({ executor });
  const dictService = createDictService({ executor, cache });
  const noticeService = createNoticeService({ executor });
  const permissionLoader = createPermissionLoader({ executor, rbac, rowFilter });
  const menuTreeBuilder = createMenuTreeBuilder({ executor });
  const passkeyService = createPasskeyService({
    executor, cache,
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
  router.get("/api/system/configs/public", async () => {
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
    extraRoutes: (r) => {
      r.put("/api/system/roles/:id/menus", async (ctx) => {
        const id = (ctx.params as Record<string, string>).id!;
        const body = await parseBody(ctx.request);
        const menuIds = (body.menuIds as string[]) ?? [];
        await roleService.assignMenus(id, menuIds);
        return ok(null);
      }, perm("system", "role:update"));
      r.put("/api/system/roles/:id/data-scope", async (ctx) => {
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
    extraRoutes: (r) => {
      r.get("/api/system/menus/tree", async () => {
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
    extraRoutes: (r) => {
      r.get("/api/system/depts/tree", async () => {
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
    extraRoutes: (r) => {
      r.get("/api/system/dict/types/:code/data", async (ctx) => {
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
    extraRoutes: (r) => {
      r.get("/api/system/configs/by-key/:key", async (ctx) => {
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
    extraRoutes: (r) => {
      r.put("/api/system/notices/:id/publish", async (ctx) => {
        const id = (ctx.params as Record<string, string>).id!;
        const user = ctx.user as { id: string };
        await noticeService.publish(id, user.id);
        return ok(null);
      }, perm("system", "notice:update"));
      r.put("/api/system/notices/:id/read", async (ctx) => {
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

  userRouter.get("/api/system/user/profile", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);
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

  // === User profile self-service ===
  userRouter.put("/api/system/user/profile", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);
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

  userRouter.put("/api/system/user/profile/password", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);
    const body = await parseBody(ctx.request);
    const { oldPassword, newPassword } = body as { oldPassword?: string; newPassword?: string };
    if (!oldPassword || !newPassword) return fail("缺少必填参数", 400, 400);

    // 验证旧密码
    const rows = await executor(
      "SELECT password_hash FROM sys_user WHERE id = $1 AND deleted_at IS NULL",
      [user.id],
    ) as Array<{ password_hash: string }>;
    if (rows.length === 0) return fail("用户不存在", 404, 404);

    const matched = await deps.passwordHasher.verify(oldPassword, rows[0]!.password_hash);
    if (!matched) return fail("旧密码错误", 400, 400);

    // 密码策略校验
    const minLength = Number(await configService.getValue("sys_password_min_length")) || 6;
    const complexity = (await configService.getValue("sys_password_complexity")) as "low" | "medium" | "high" || "low";
    const validation = validatePassword(newPassword, { minLength, complexity });
    if (!validation.valid) return fail(validation.message, 400, 400);

    const hash = await deps.passwordHasher.hash(newPassword);
    await executor(
      "UPDATE sys_user SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2",
      [hash, user.id],
    );
    await cache.del(`user:detail:${user.id}`);
    return ok(null);
  });

  userRouter.post("/api/system/user/profile/avatar", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);

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

    await executor(
      "UPDATE sys_user SET avatar = $1, updated_at = NOW() WHERE id = $2",
      [avatarUrl, user.id],
    );
    await cache.del(`user:detail:${user.id}`);
    return ok({ avatar: avatarUrl });
  });

  // === MFA status ===
  userRouter.get("/api/auth/mfa/status", async (ctx) => {
    const user = ctx.user as { id: string } | undefined;
    if (!user?.id) return fail("Not authenticated", 401, 401);
    const rows = await executor(
      "SELECT mfa_enabled FROM sys_user WHERE id = $1 AND deleted_at IS NULL",
      [user.id],
    ) as Array<{ mfa_enabled: boolean }>;
    if (rows.length === 0) return fail("用户不存在", 404, 404);
    return ok({ enabled: rows[0]!.mfa_enabled });
  });

  // === Dict data CRUD ===
  userRouter.post("/api/system/dict/data", async (ctx) => {
    const body = await parseBody(ctx.request);
    const result = await dictService.createData(body as unknown as CreateDictDataParams);
    return ok(result);
  }, perm("system", "dict:create"));
  userRouter.put("/api/system/dict/data/:id", async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await dictService.updateData(id, body as Record<string, unknown>);
    return ok(null);
  }, perm("system", "dict:update"));
  userRouter.delete("/api/system/dict/data/:id", async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await dictService.deleteData(id);
    return ok(null);
  }, perm("system", "dict:delete"));

  // === Notice revoke ===
  userRouter.put("/api/system/notices/:id/revoke", async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await noticeService.revoke(id);
    return ok(null);
  }, perm("system", "notice:update"));

  // === User unlock & blacklist ===
  userRouter.put("/api/system/users/:id/unlock", async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await executor(`UPDATE sys_user SET locked_until = NULL, login_attempts = 0 WHERE id = $1`, [id]);
    await cache.del(`user:detail:${id}`);
    return ok(null);
  }, perm("system", "user:update"));

  userRouter.put("/api/system/users/:id/blacklist", async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    const blacklisted = body.blacklisted as boolean;
    await executor(`UPDATE sys_user SET blacklisted = $1 WHERE id = $2`, [blacklisted, id]);
    await cache.del(`user:detail:${id}`);
    return ok(null);
  }, perm("system", "user:update"));

  // === Operation logs (read-only) ===
  const opLogPerm = perm("system", "log:list");
  userRouter.get("/api/system/operation-logs", async (ctx) => {
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

    return okPage(rows as unknown[], total, page, pageSize);
  }, opLogPerm);

  // === Login logs (read-only) ===
  userRouter.get("/api/system/login-logs", async (ctx) => {
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

    return okPage(rows as unknown[], total, page, pageSize);
  }, opLogPerm);

  userRouter.delete("/api/system/login-logs", async () => {
    await executor(`TRUNCATE TABLE sys_login_log`);
    return ok(null);
  }, opLogPerm);

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
      notice: noticeService, permissionLoader, menuTreeBuilder, passkey: passkeyService,
    },
    router,
    async init() {
      await permissionLoader.loadAll();
    },
  };
}
