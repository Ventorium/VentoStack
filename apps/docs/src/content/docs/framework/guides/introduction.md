---
order: 1
title: VentoStack 简介
description: 了解 VentoStack 框架的设计理念、核心特性和架构概览
---

VentoStack 是一个专为 [Bun](https://bun.sh) 运行时构建的全栈后端框架。它采用函数式优先的设计理念，提供了构建现代 Web 应用所需的完整工具集。

## 设计理念

### 函数式优先

VentoStack 摒弃了传统 Node.js 框架中常见的类和装饰器模式，转而采用工厂函数（Factory Function）模式：

```typescript
// 不使用类
class Router { ... }
new Router().get(...)

// VentoStack 的方式 - 工厂函数
const router = createRouter()
router.get('/path', handler)
```

这种方式带来以下优势：
- 代码更易测试（无需 `new` 和继承）
- 更好的 TypeScript 类型推断
- 无副作用，依赖显式传入
- 更容易进行函数组合

### 显式依赖

所有依赖通过参数显式传入，没有全局单例：

```typescript
// 不使用全局单例
import db from './global-db'

// VentoStack 的方式 - 显式依赖
const app = createApp({ port: 3000 })
const db = createDatabase({ url: process.env.DATABASE_URL! })
const cache = createCache(createMemoryAdapter())
```

### Bun 原生

VentoStack 充分利用 Bun 的内置能力：
- `Bun.serve()` 作为 HTTP 服务器底层
- `Bun.SQLite` 用于嵌入式数据库
- `Bun.file()` 用于文件 I/O
- `Bun.password` 用于安全密码哈希

## 包结构

VentoStack 的全部能力以 `@ventostack/*` 系列包发布到 npm，共 **23 个包**，分为框架层（12 个）与平台层（11 个）：

- **框架层**：`core`（HTTP 应用、路由、中间件、错误处理、配置、校验、限流、熔断、WebSocket、gRPC 等）、`database`、`cache`、`events`、`observability`、`openapi`、`testing`、`webhook`、`cli`、`file2md`、`ai`、`vite-bridge`
- **平台层**：`auth`（JWT、密码哈希、Session、API Key、RBAC、ABAC、TOTP、OAuth、策略引擎、行级过滤）、`system`、`boot`、`gen`、`i18n`、`monitor`、`notification`、`oss`、`scheduler`、`workflow`、`integration`

完整的包能力清单、依赖关系与按应用场景的选型指南，见 [包总览与选型](./packages)。

## 为什么选择 VentoStack？

### vs Express/Fastify

Express 和 Fastify 为 Node.js 设计，在 Bun 上运行有兼容性开销。VentoStack 直接基于 `Bun.serve()` 构建，性能更优。

### vs Hono

Hono 是优秀的轻量框架，但功能单一。VentoStack 提供完整的生态，包括数据库、缓存、认证等一站式解决方案。

### vs NestJS

NestJS 依赖装饰器和复杂的依赖注入系统，学习曲线陡峭。VentoStack 采用简单的函数组合，上手更快。
