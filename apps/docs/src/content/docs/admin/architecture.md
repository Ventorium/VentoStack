---
order: 2
title: 架构详解
description: Admin 后端与前端的架构设计详解。
---

## 后端架构

### Composition Root 模式

Admin 后端采用严格的 Composition Root 模式：

```
index.ts (入口层)
  ├── 顶层错误边界
  └── buildApp() (装配层 app.ts)
        ├── 1. 基础设施（数据库、缓存、存储、可观测性）
        ├── 2. 认证引擎（JWT、密码、RBAC、Session 等）
        ├── 3. createPlatform()（聚合所有平台模块）
        ├── 4. 应用装配（中间件、路由、静态文件）
        └── 5. 优雅关停
```

**职责分离**：
- `index.ts`：仅负责启动和顶层错误捕获，不包含业务逻辑
- `app.ts`：装配工厂，组合基础设施 + 平台模块 + 中间件 + 路由
- `config/`：环境变量定义与校验（`createConfig`）
- `auth/`：认证引擎组装（`assembleAuthEngines`）
- `database/`：连接管理、迁移、种子数据
- `cache/`：缓存实例创建
- `storage/`：存储适配器创建

### 模块开关

`createPlatform()` 支持按需启用/禁用模块：

```typescript
const platform = await createPlatform({
  // ...
  modules: {
    system: true,        // 系统管理（核心，建议始终启用）
    gen: true,           // 代码生成
    monitor: true,       // 系统监控
    notification: true,  // 通知中心
    i18n: true,          // 国际化
    workflow: true,      // 工作流
    oss: true,           // 文件存储
    scheduler: true,     // 定时任务
  },
  notifyChannels: new Map([
    ["in_app", createInAppChannel()],
  ]),
});
```

### 中间件链（顺序敏感）

```
1. requestId()              — 请求 ID 注入
2. tracingMiddleware        — 分布式追踪
3. cors()                   — 跨域配置
4. requestLogger()          — 请求日志
5. healthRouter             — 健康检查（无需认证）
6. metricsRouter            — 指标端点（无需认证）
7. openAPIPlugin            — API 文档
8. staticMiddleware         — 上传文件服务
9. spaMiddleware            — SPA 前端静态文件（生产模式）
10. authRateLimit           — 认证端点限流
11. platform.router         — 平台模块路由
12. errorHandler            — 全局错误处理
```

## 前端架构

### 技术栈

| 技术 | 用途 |
|------|------|
| React 18 | UI 框架 |
| Ant Design 5 | 组件库 |
| UnoCSS | 原子化 CSS |
| Zustand | 状态管理 |
| React Router 7 | 路由 |
| Vite 7 | 构建工具 |
| vite-plugin-pages | 文件系统路由 |

### API 客户端

前端使用 `createFetchClient<OpenAPIs>` 实现类型安全的 API 调用：

```typescript
// ✅ 类型安全，params 路径参数
const { error, data } = await client.get('/api/system/users/:id', { params: { id } });
const { error, data } = await client.put('/api/system/users/:id', { params: { id }, body: values });

// ❌ 禁止模板字符串拼接
client.get(`/api/system/users/${id}`);
```

**自动 Token 刷新**：401 响应自动触发 Refresh Token 流程，并发 401 请求合并为单次刷新。

### 目录结构

```
web/src/
├── api/           # API 客户端（schema.ts + types.ts + index.ts）
├── components/    # 共享组件（ActionColumn、DictSelect 等）
├── hooks/         # 自定义 Hooks（useTable、useDict 等）
├── layouts/       # 布局组件（UserLayout、AuthLayout）
├── pages/         # 页面（文件系统路由）
│   ├── app/       # 主应用页面
│   │   ├── system/  # 系统管理页面
│   │   └── profile/ # 个人中心
│   └── auth/      # 认证页面
├── store/         # Zustand 状态（useAuth、useMenu、token）
├── utils/         # 工具函数
└── lib/           # 库函数
```
