---
name: admin-backend-entity
description: "When creating or modifying admin backend entities (services, routes, models, i18n, permissions) in the VentoStack platform. Use when adding a new business entity, modifying an existing entity's schema, or working with admin CRUD operations."
---

# Admin Backend Entity Guide

Guide for creating and modifying admin backend entities in VentoStack. Use this skill when working with admin CRUD operations, services, routes, models, i18n, or permissions.

## When to Use

- Adding a new business entity to the admin system
- Modifying an existing entity's schema or behavior
- Working with admin CRUD operations
- Creating or updating services, routes, models, i18n, or permissions

## Directory Structure

All admin backend entities live under the packages/platform directory:

```
packages/platform/{module}/src/
├── models/           # Model definitions
├── services/         # Service layer
├── routes/           # HTTP routes
├── __tests__/        # Test files
└── i18n/             # Internationalization resources
```

## Creating a New Entity

### 1. Model Definition

Create a model file in `packages/platform/{module}/src/models/`. Use snake_case for database column names and camelCase for TypeScript interfaces.

Example: `packages/platform/system/src/models/dict-data.ts`

```typescript
import type { Model } from "@ventostack/database";

export interface DictData {
  id: number;
  dictType: string;
  label: string;
  value: string;
  sortOrder: number;
  status: number;
  remark: string | null;
}

export const DictDataModel: Model = {
  tableName: "sys_dict_data",
  columns: {
    id: { type: "number", autoIncrement: true },
    dict_type: { type: "string", maxLength: 100 },
    label: { type: "string", maxLength: 100 },
    value: { type: "string", maxLength: 100 },
    sort_order: { type: "number" },
    status: { type: "number" },
    remark: { type: "string", maxLength: 500, nullable: true },
  },
};
```

### 2. Service Layer

Create a service file in `packages/platform/{module}/src/services/`. Follow the functional pattern with explicit dependency injection.

Example: `packages/platform/system/src/services/dict-data.ts`

```typescript
import type { Database } from "@ventostack/database";
import { DictDataModel, type DictData } from "../models/dict-data";
import { paginate, type PaginationParams, type PaginatedResult } from "@ventostack/core";

export interface DictDataService {
  list(params: PaginationParams & { dictType?: string }): Promise<PaginatedResult<DictData>>;
  getById(id: number): Promise<DictData | null>;
  create(data: Omit<DictData, "id">): Promise<DictData>;
  update(id: number, data: Partial<Omit<DictData, "id">>): Promise<DictData | null>;
  delete(id: number): Promise<boolean>;
}

export function createDictDataService(db: Database): DictDataService {
  return {
    async list(params) {
      const { page = 1, pageSize = 10, dictType } = params;
      let query = db.from(DictDataModel).select("*");

      if (dictType) {
        query = query.where("dict_type", "=", dictType);
      }

      return paginate(query, { page, pageSize });
    },

    async getById(id) {
      return db.from(DictDataModel).where("id", "=", id).first();
    },

    async create(data) {
      const [result] = await db.from(DictDataModel).insert(data).returning("*");
      return result;
    },

    async update(id, data) {
      const [result] = await db.from(DictDataModel)
        .where("id", "=", id)
        .update(data)
        .returning("*");
      return result || null;
    },

    async delete(id) {
      const result = await db.from(DictDataModel).where("id", "=", id).delete();
      return result > 0;
    },
  };
}
```

### 3. Routes

Create a route file in `packages/platform/{module}/src/routes/`. Use the router from `@ventostack/core`.

Example: `packages/platform/system/src/routes/dict-data.ts`

```typescript
import { Router, validate, type Context } from "@ventostack/core";
import { z } from "zod";
import { createDictDataService } from "../services/dict-data";
import { requirePermission } from "@ventostack/auth";

const router = new Router({ prefix: "/api/system/dict-data" });

const createSchema = z.object({
  dictType: z.string().max(100),
  label: z.string().max(100),
  value: z.string().max(100),
  sortOrder: z.number().int(),
  status: z.number().int().min(0).max(1),
  remark: z.string().max(500).nullable(),
});

const updateSchema = createSchema.partial();

router.get(
  "/",
  requirePermission("system:dict:list"),
  async (ctx: Context) => {
    const service = createDictDataService(ctx.db);
    const params = ctx.query;
    const result = await service.list({
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 10,
      dictType: params.dictType as string | undefined,
    });
    return ctx.json(result);
  }
);

router.get(
  "/:id",
  requirePermission("system:dict:query"),
  async (ctx: Context) => {
    const service = createDictDataService(ctx.db);
    const id = Number(ctx.params.id);
    const item = await service.getById(id);
    if (!item) {
      return ctx.json({ code: 404, message: "Dict data not found" }, 404);
    }
    return ctx.json(item);
  }
);

router.post(
  "/",
  requirePermission("system:dict:add"),
  validate(createSchema),
  async (ctx: Context) => {
    const service = createDictDataService(ctx.db);
    const data = ctx.body;
    const item = await service.create(data);
    return ctx.json(item, 201);
  }
);

router.put(
  "/:id",
  requirePermission("system:dict:edit"),
  validate(updateSchema),
  async (ctx: Context) => {
    const service = createDictDataService(ctx.db);
    const id = Number(ctx.params.id);
    const data = ctx.body;
    const item = await service.update(id, data);
    if (!item) {
      return ctx.json({ code: 404, message: "Dict data not found" }, 404);
    }
    return ctx.json(item);
  }
);

router.delete(
  "/:id",
  requirePermission("system:dict:remove"),
  async (ctx: Context) => {
    const service = createDictDataService(ctx.db);
    const id = Number(ctx.params.id);
    const deleted = await service.delete(id);
    if (!deleted) {
      return ctx.json({ code: 404, message: "Dict data not found" }, 404);
    }
    return ctx.json({ code: 200, message: "success" });
  }
);

export default router;
```

### 4. i18n Resources

Add i18n resources in the appropriate language files. The admin frontend uses i18n for all user-facing text.

Example: Add to `packages/platform/system/src/i18n/locales/zh-CN.json`

```json
{
  "system": {
    "dict": {
      "title": "字典管理",
      "fields": {
        "dictType": "字典类型",
        "label": "字典标签",
        "value": "字典值",
        "sortOrder": "排序",
        "status": "状态",
        "remark": "备注"
      },
      "messages": {
        "created": "字典数据创建成功",
        "updated": "字典数据更新成功",
        "deleted": "字典数据删除成功"
      }
    }
  }
}
```

### 5. Permissions

Register permissions for the entity. Permissions follow the pattern `{module}:{entity}:{action}`.

Example: Add to permission definitions

```typescript
// In permission definitions
{
  module: "system",
  entity: "dict",
  actions: ["list", "query", "add", "edit", "remove", "export"],
}
```

## Modifying an Existing Entity

### 1. Schema Changes

If modifying the database schema, create a migration file in `packages/platform/{module}/src/migrations/`.

Example: `packages/platform/system/src/migrations/20260508-add-dict-data-status.ts`

```typescript
import type { Migration } from "@ventostack/database";

export const migration: Migration = {
  name: "20260508-add-dict-data-status",
  up: async (db) => {
    await db.raw(`ALTER TABLE sys_dict_data ADD COLUMN status TINYINT DEFAULT 1`);
  },
  down: async (db) => {
    await db.raw(`ALTER TABLE sys_dict_data DROP COLUMN status`);
  },
};
```

### 2. Service Updates

Update the service file to handle new fields or modify existing behavior.

### 3. Route Updates

Update route handlers to accept and validate new fields.

### 4. i18n Updates

Add translations for new fields or messages.

## Testing

Create tests in `packages/platform/{module}/src/__tests__/`.

Example: `packages/platform/system/src/__tests__/dict-data.test.ts`

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { createTestDatabase } from "@ventostack/testing";
import { createDictDataService } from "../services/dict-data";

describe("DictDataService", () => {
  let db: any;
  let service: ReturnType<typeof createDictDataService>;

  beforeEach(async () => {
    db = await createTestDatabase();
    service = createDictDataService(db);
  });

  test("should create dict data", async () => {
    const data = {
      dictType: "sys_status",
      label: "启用",
      value: "1",
      sortOrder: 1,
      status: 1,
      remark: null,
    };

    const result = await service.create(data);

    expect(result.id).toBeDefined();
    expect(result.dictType).toBe(data.dictType);
    expect(result.label).toBe(data.label);
  });

  test("should list dict data with pagination", async () => {
    // Create test data
    await service.create({
      dictType: "sys_status",
      label: "启用",
      value: "1",
      sortOrder: 1,
      status: 1,
      remark: null,
    });

    const result = await service.list({ page: 1, pageSize: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  test("should update dict data", async () => {
    const created = await service.create({
      dictType: "sys_status",
      label: "启用",
      value: "1",
      sortOrder: 1,
      status: 1,
      remark: null,
    });

    const updated = await service.update(created.id, { label: "禁用" });

    expect(updated).not.toBeNull();
    expect(updated!.label).toBe("禁用");
  });

  test("should delete dict data", async () => {
    const created = await service.create({
      dictType: "sys_status",
      label: "启用",
      value: "1",
      sortOrder: 1,
      status: 1,
      remark: null,
    });

    const deleted = await service.delete(created.id);

    expect(deleted).toBe(true);

    const found = await service.getById(created.id);
    expect(found).toBeNull();
  });
});
```

## Best Practices

1. **Type Safety**: Use TypeScript interfaces for all data structures. Avoid `any` types.
2. **Validation**: Validate all input using Zod schemas at the route level.
3. **Error Handling**: Use proper HTTP status codes and error messages.
4. **Pagination**: Always paginate list endpoints.
5. **Permissions**: Require appropriate permissions for all operations.
6. **i18n**: Use i18n for all user-facing text.
7. **Testing**: Write tests for all service methods.
8. **Database**: Use parameterized queries. Never concatenate strings.
9. **Naming**: Use snake_case for database columns, camelCase for TypeScript.
10. **Functional Style**: Use functions and explicit dependencies, not classes.
