---
title: 错误处理
description: Aeron 内置错误类型和错误处理机制
---

Aeron 提供了一套完整的错误类型层级，方便在路由和中间件中抛出语义明确的错误。

## 内置错误类型

```typescript
import {
  AeronError,       // 基类
  ClientError,      // 4xx 错误基类
  ServerError,      // 5xx 错误基类
  NotFoundError,    // 404
  ValidationError,  // 422（通常）
  UnauthorizedError, // 401
  ForbiddenError,   // 403
} from "@aeron/core";
```

### 错误层级

```
AeronError
├── ClientError (4xx)
│   ├── NotFoundError (404)
│   ├── ValidationError (422)
│   ├── UnauthorizedError (401)
│   └── ForbiddenError (403)
└── ServerError (5xx)
```

## 抛出错误

```typescript
import { NotFoundError, ValidationError, UnauthorizedError } from "@aeron/core";

router.get("/users/:id", async (ctx) => {
  const user = await db.from("users").where("id", "=", ctx.params.id).first();

  if (!user) {
    throw new NotFoundError("用户不存在");
  }

  return ctx.json(user);
});

router.post("/users", async (ctx) => {
  const body = await ctx.body<{ email: string }>();

  if (!body.email || !body.email.includes("@")) {
    throw new ValidationError("邮箱格式无效", { field: "email" });
  }

  const user = await createUser(body);
  return ctx.json(user, 201);
});
```

## 全局错误处理中间件

建议在应用入口注册全局错误处理中间件：

```typescript
import { AeronError, ClientError, ServerError } from "@aeron/core";
import type { Middleware } from "@aeron/core";

const errorHandler: Middleware = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof AeronError) {
      return ctx.json(
        {
          error: err.message,
          code: err.code,
          ...(err instanceof ValidationError ? { details: err.details } : {})
        },
        err.statusCode
      );
    }

    // 未预期的错误
    console.error("Unhandled error:", err);
    return ctx.json({ error: "内部服务器错误" }, 500);
  }
};

const app = createApp({ port: 3000 });
app.use(errorHandler); // 第一个注册，捕获所有后续错误
```

## 自定义错误类型

```typescript
import { ClientError } from "@aeron/core";

class PaymentRequiredError extends ClientError {
  constructor(message: string) {
    super(message, 402, "PAYMENT_REQUIRED");
  }
}

class RateLimitError extends ClientError {
  constructor(retryAfter: number) {
    super("请求过于频繁，请稍后重试", 429, "RATE_LIMIT_EXCEEDED");
    this.retryAfter = retryAfter;
  }

  readonly retryAfter: number;
}

// 使用
router.post("/checkout", async (ctx) => {
  const user = ctx.state.user;
  if (!user.hasPlan) {
    throw new PaymentRequiredError("需要升级到付费计划");
  }
  // ...
});
```

## 错误类构造参数

```typescript
// AeronError 基类
new AeronError(message: string, statusCode: number, code?: string)

// 预定义错误
new NotFoundError(message?: string)        // 404, "NOT_FOUND"
new UnauthorizedError(message?: string)    // 401, "UNAUTHORIZED"
new ForbiddenError(message?: string)       // 403, "FORBIDDEN"
new ValidationError(message: string, details?: unknown) // 422, "VALIDATION_ERROR"
```
