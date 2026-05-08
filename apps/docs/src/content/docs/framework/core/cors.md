---
title: CORS
description: 跨域资源共享中间件，支持灵活的源匹配和预检请求处理
---

`cors` 中间件自动处理 CORS 预检请求（OPTIONS）并在响应中附加跨域头。

## 基本用法

```typescript
import { cors } from "@ventostack/core";

// 允许单个源
app.use(cors({ origin: "https://example.com" }));
```

## 允许多个源

```typescript
app.use(cors({
  origin: ["https://a.com", "https://b.com"],
}));
```

## 函数匹配

```typescript
app.use(cors({
  origin: (origin) => origin.endsWith(".example.com"),
}));
```

## 完整配置

```typescript
app.use(cors({
  origin: "https://example.com",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["X-Total-Count"],
  credentials: true,
  maxAge: 86400, // 预检缓存 24 小时
}));
```

## 配置选项

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `origin` | `string \| string[] \| (origin) => boolean` | — | 允许的源（不设置则拒绝） |
| `methods` | `string[]` | `["GET","HEAD","PUT","PATCH","POST","DELETE"]` | 允许的 HTTP 方法 |
| `allowedHeaders` | `string[]` | 反射请求头 | 允许的请求头 |
| `exposedHeaders` | `string[]` | — | 暴露给客户端的响应头 |
| `credentials` | `boolean` | `false` | 是否允许携带凭证 |
| `maxAge` | `number` | — | 预检请求缓存时间（秒） |

## 注意事项

- `credentials: true` 与 `origin: "*"` 不可同时使用，会抛出错误
- 无 `Origin` 请求头时中间件不处理 CORS（直接放行）
- 未匹配的源在预检请求时返回 `403`
