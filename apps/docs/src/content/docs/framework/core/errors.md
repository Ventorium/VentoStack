---
order: 6
title: 错误处理
description: VentoStack 内置错误类型和错误处理机制
---

VentoStack 提供了一套完整的错误类型层级，方便在路由和中间件中抛出语义明确的错误。

## 内置错误类型

```typescript
import {
  VentoStackError,       // 基类
  ClientError,      // 4xx 错误基类
  ServerError,      // 5xx 错误基类
  NotFoundError,    // 404
  ValidationError,  // 400
  UnauthorizedError, // 401
  ForbiddenError,   // 403
} from "@ventostack/core";
```

### 错误层级

```
VentoStackError
├── ClientError (4xx)
│   ├── NotFoundError (404)
│   ├── ValidationError (400)
│   ├── UnauthorizedError (401)
│   └── ForbiddenError (403)
└── ServerError (5xx)
```

## 抛出错误

```typescript
import { NotFoundError, ValidationError, UnauthorizedError } from "@ventostack/core";

router.get("/users/:id<int>", async (ctx) => {
  const user = await db.query(UserModel).where("id", "=", ctx.params.id).get();

  if (!user) {
    throw new NotFoundError("用户不存在");
  }

  return ctx.json(user);
});

router.post("/users", defineRouteConfig({
  body: {
    email: { type: "string", required: true },
  },
}), async (ctx) => {
  if (!ctx.body.email.includes("@")) {
    throw new ValidationError("邮箱格式无效", { field: "email" });
  }

  const user = await createUser(ctx.body as { email: string });
  return ctx.json(user, 201);
});
```

## 全局错误处理中间件

建议在应用入口注册全局错误处理中间件：

```typescript
import { errorHandler } from "@ventostack/core";

const app = createApp({ port: 3000 });

// 建议作为第一个中间件注册，捕获所有后续错误
app.use(errorHandler());

// 传入自定义 logger
app.use(errorHandler({ logger }));

// 静默模式（测试环境禁用日志）
app.use(errorHandler({ silent: true }));
```

如果需要自定义错误处理逻辑，也可以手动实现：

```typescript
import { VentoStackError, ClientError, ServerError, ValidationError } from "@ventostack/core";
import type { Middleware } from "@ventostack/core";

const customErrorHandler: Middleware = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof VentoStackError) {
      return ctx.json(
        {
          error: err.message,
          code: err.code,
          ...(err instanceof ValidationError ? { details: err.details } : {})
        },
        err.code
      );
    }

    // 未预期的错误
    console.error("Unhandled error:", err);
    return ctx.json({ error: "内部服务器错误" }, 500);
  }
};
```

`errorHandler` 中间件统一捕获未处理异常：
- `VentoStackError` 返回结构化响应（包含 `errorCode` 和 `message`）
- 其他错误返回 500，且不暴露内部错误细节

## 自定义错误类型

```typescript
import { ClientError } from "@ventostack/core";

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
// VentoStackError 基类
new VentoStackError(message: string, statusCode: number, errorCode: string)

// 预定义错误
new NotFoundError(message?: string)        // 404, "NOT_FOUND"
new UnauthorizedError(message?: string)    // 401, "UNAUTHORIZED"
new ForbiddenError(message?: string)       // 403, "FORBIDDEN"
new ValidationError(message: string, details?: Record<string, unknown>) // 400, "VALIDATION_ERROR"
new ClientError(message?: string, code?: number, errorCode?: string) // 400, "CLIENT_ERROR"
new ServerError(message?: string, code?: number, errorCode?: string) // 500, "SERVER_ERROR"
```
