/**
 * @ventostack/system - 通用 CRUD 路由工厂
 *
 * 为角色、菜单、部门、岗位、字典、配置等实体提供统一的路由定义。
 * 使用 router.use(authMiddleware) 注册为组中间件。
 */

import { createRouter } from "@ventostack/core";
import type { Middleware, Router, RouteSchemaConfig } from "@ventostack/core";
import { ok, okPage, fail, parseBody, pageOf } from "./common";

interface CrudService {
  list: (params: Record<string, unknown>) => Promise<{ items: unknown[]; total: number; page: number; pageSize: number }>;
  getById?: (id: string) => Promise<unknown>;
  create: (body: unknown) => Promise<{ id: string }>;
  update: (id: string, body: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

/** CRUD 路由可选的 Schema 配置 */
export interface CrudSchemas {
  /** 列表项 Schema（会被 list 响应和 getById 响应复用） */
  item?: Record<string, { type: string; description?: string; format?: string; example?: unknown }>;
  /** 创建请求体 Schema */
  createBody?: Record<string, { type: string; required?: boolean; description?: string; min?: number; max?: number; format?: string; enum?: string[]; default?: unknown }>;
  /** 更新请求体 Schema */
  updateBody?: Record<string, { type: string; required?: boolean; description?: string; min?: number; max?: number; format?: string; enum?: string[] }>;
  /** 额外的响应 Schema（按路由路径索引） */
  extraResponses?: Record<string, Record<number, { description?: string; [field: string]: unknown }>>;
}

interface CrudRouteOptions {
  basePath: string;
  resource: string;
  service: CrudService;
  authMiddleware: Middleware;
  perm: (resource: string, action: string) => Middleware;
  extraRoutes?: (router: Router) => void;
  schemas?: CrudSchemas;
}

export function createCrudRoutes(options: CrudRouteOptions): Router {
  const { basePath, resource, service, authMiddleware, perm, extraRoutes, schemas } = options;
  const router = createRouter();
  const module = resource.split(":")[0]!;

  // Auth middleware applies to all CRUD routes
  router.use(authMiddleware);

  // List
  const listConfig = schemas?.item ? {
    query: {
      page: { type: "int" as const, default: 1, description: "页码" },
      pageSize: { type: "int" as const, default: 10, description: "每页数量" },
    },
    responses: {
      200: {
        list: { type: "array" as const, description: "列表数据" },
        total: { type: "int" as const, description: "总数" },
        page: { type: "int" as const, description: "当前页" },
        pageSize: { type: "int" as const, description: "每页数量" },
        totalPages: { type: "int" as const, description: "总页数" },
      },
    },
    openapi: { summary: `获取${resource}列表`, tags: [module] },
  } as RouteSchemaConfig : undefined;

  router.get(`${basePath}`, listConfig ?? {}, async (ctx) => {
    const { page, pageSize } = pageOf(ctx.query as Record<string, unknown>);
    const result = await service.list({ ...(ctx.query as Record<string, unknown>), page, pageSize });
    return okPage(result.items, result.total, result.page, result.pageSize);
  }, perm(module, `${resource}:list`));

  // Get by ID
  if (service.getById) {
    const getByIdConfig = schemas?.item ? {
      responses: { 200: schemas.item },
      openapi: { summary: `获取${resource}详情`, tags: [module] },
    } as RouteSchemaConfig : undefined;
    router.get(`${basePath}/:id`, getByIdConfig ?? {}, async (ctx) => {
      const id = (ctx.params as Record<string, string>).id!;
      const item = await service.getById!(id);
      if (!item) return fail("Not found", 404, 404);
      return ok(item);
    }, perm(module, `${resource}:query`));
  }

  // Create
  const createConfig = schemas?.createBody ? {
    body: schemas.createBody,
    responses: { 200: { id: { type: "uuid" as const, description: "创建的记录 ID" } } },
    openapi: { summary: `创建${resource}`, tags: [module] },
  } as RouteSchemaConfig : undefined;
  router.post(`${basePath}`, createConfig ?? {}, async (ctx) => {
    try {
      const body = await parseBody(ctx.request);
      const result = await service.create(body);
      return ok(result);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Create failed", 400);
    }
  }, perm(module, `${resource}:create`));

  // Update
  const updateConfig = schemas?.updateBody ? {
    body: schemas.updateBody,
    openapi: { summary: `更新${resource}`, tags: [module] },
  } as RouteSchemaConfig : undefined;
  router.put(`${basePath}/:id`, updateConfig ?? {}, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    const body = await parseBody(ctx.request);
    await service.update(id, body);
    return ok(null);
  }, perm(module, `${resource}:update`));

  // Delete
  router.delete(`${basePath}/:id`, schemas?.item ? {
    openapi: { summary: `删除${resource}`, tags: [module] },
  } : {}, async (ctx) => {
    const id = (ctx.params as Record<string, string>).id!;
    await service.delete(id);
    return ok(null);
  }, perm(module, `${resource}:delete`));

  // Extra routes (also protected by authMiddleware via router.use above)
  if (extraRoutes) {
    extraRoutes(router);
  }

  return router;
}
