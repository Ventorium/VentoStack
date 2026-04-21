---
title: 分页
description: 使用 createPaginator 实现高效的数据分页
---

`createPaginator` 提供了基于页码和基于游标两种分页方式。

## 基于页码的分页

```typescript
import { createPaginator } from "@aeron/database";

const paginator = createPaginator(db);

router.get("/users", async (ctx) => {
  const page = Number(ctx.query.page ?? 1);
  const limit = Number(ctx.query.limit ?? 20);

  const result = await paginator.paginate(
    db.from("users").where("active", "=", true).orderBy("created_at", "DESC"),
    { page, limit }
  );

  return ctx.json({
    data: result.data,
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    }
  });
});
```

响应示例：

```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": true
  }
}
```

## 基于游标的分页（无限滚动）

游标分页性能更优，适合大数据集和无限滚动场景：

```typescript
router.get("/feed", async (ctx) => {
  const cursor = ctx.query.cursor;
  const limit = Number(ctx.query.limit ?? 20);

  const result = await paginator.cursorPaginate(
    db.from("posts").where("published", "=", true).orderBy("created_at", "DESC"),
    { cursor, limit, cursorField: "created_at" }
  );

  return ctx.json({
    data: result.data,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  });
});
```

响应示例：

```json
{
  "data": [...],
  "nextCursor": "2024-01-15T10:30:00.000Z",
  "hasMore": true
}
```

客户端下次请求时传入 `?cursor=2024-01-15T10:30:00.000Z`。

## Paginator 接口

```typescript
interface PaginateOptions {
  page: number;
  limit: number;
}

interface PaginateResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface CursorPaginateOptions {
  cursor?: string;
  limit: number;
  cursorField: string;
}

interface CursorPaginateResult<T> {
  data: T[];
  nextCursor?: string;
  hasMore: boolean;
}
```
