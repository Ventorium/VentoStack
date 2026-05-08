---
order: 5
title: 分页
description: 使用 limit / offset 实现数据分页
---

VentoStack 的查询构建器通过 `limit` 和 `offset` 实现分页，没有单独的 `createPaginator` 函数。

## 基于页码的分页

```typescript
router.get("/users", async (ctx) => {
  const page = Math.max(1, parseInt(ctx.query.page ?? "1", 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(ctx.query.limit ?? "20", 10) || 20));
  const offset = (page - 1) * limit;

  const data = await db
    .query(UserModel)
    .where("active", "=", true)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .offset(offset)
    .list();

  const total = await db.query(UserModel).where("active", "=", true).count();
  const totalPages = Math.ceil(total / limit);

  return ctx.json({
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
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

游标分页性能更优，适合大数据集和无限滚动场景。利用 `where` + `orderBy` + `limit` 实现：

```typescript
router.get("/feed", async (ctx) => {
  const cursor = ctx.query.cursor;
  const pageSize = 20;

  let query = db.query(PostModel).orderBy("createdAt", "desc").limit(pageSize);
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (isNaN(cursorDate.getTime())) throw new Error("Invalid cursor");
    query = query.where("createdAt", "<", cursorDate);
  }
  const rows = await query.list();

  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? data[data.length - 1]?.createdAt.toISOString() : undefined;

  return ctx.json({
    data,
    nextCursor,
    hasMore,
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

## 注意事项

- 框架未提供 `createPaginator` 或 `cursorPaginate` 等高层封装，需自行组合 `limit` / `offset` / `count` / `where` 实现
- `QueryExecutor` 提供 `count()` 方法用于获取总行数。`count()` 会忽略查询上已设置的 `limit` 和 `offset`，仅统计满足条件的总行数
- `get()` 始终返回至多一行。如果查询未设置 `limit`，框架会自动追加 `LIMIT 1`；如果已设置 `limit`，则保留该限制值
- 游标分页需要确保游标字段上有索引，且排序方向与查询条件一致
