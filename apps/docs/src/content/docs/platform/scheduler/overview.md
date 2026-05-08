---
title: 任务调度概述
description: '任务调度模块提供定时任务的 CRUD、启停控制、手动触发和执行日志管理，基于 @ventostack/events 的 Scheduler 构建。'
---

## 概述

`@ventostack/scheduler` 是 VentoStack 平台层的定时任务管理模块，基于 `@ventostack/events` 的 `Scheduler` 能力，在其之上增加了任务持久化（数据库）、管理 API、执行日志和启停控制。

## 架构关系

```
@ventostack/scheduler
        │
        │  使用 Scheduler 实例
        ▼
@ventostack/events  (createScheduler)
        │
        │  基于
        ▼
@ventostack/core  (lifecycle)
```

## 快速开始

### 创建调度模块

```typescript
import { createSchedulerModule } from '@ventostack/scheduler';
import { createScheduler } from '@ventostack/events';

// 创建框架层调度器
const scheduler = createScheduler();

// 定义任务处理器
const handlers = {
  cleanExpiredSessions: async (params) => {
    // 清理过期会话逻辑
    return '清理完成';
  },
  syncDictCache: async (params) => {
    // 字典缓存同步逻辑
    return '同步完成';
  },
};

// 创建调度模块
const schedulerModule = createSchedulerModule({
  db,
  scheduler,
  handlers,
  jwt,
  jwtSecret,
  rbac,
});

// 注册路由
app.use(schedulerModule.router);

// 初始化（自动启动所有 status=1 的任务）
await schedulerModule.init();
```

### 模块依赖

```typescript
interface SchedulerModuleDeps {
  db: Database;                    // 数据库实例
  scheduler: Scheduler;            // @ventostack/events 的调度器
  handlers: JobHandlerMap;         // 任务处理器映射
  jwt: JWTManager;                 // JWT 管理器
  jwtSecret: string;               // JWT 密钥
  rbac?: RBAC;                     // 权限控制（可选）
}
```

## API 路由

所有路由前缀 `/api/scheduler`，需要认证：

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/scheduler/jobs` | `scheduler:job:list` | 查询任务列表 |
| GET | `/api/scheduler/jobs/:id` | `scheduler:job:query` | 查询任务详情 |
| POST | `/api/scheduler/jobs` | `scheduler:job:create` | 创建任务 |
| PUT | `/api/scheduler/jobs/:id` | `scheduler:job:update` | 更新任务 |
| DELETE | `/api/scheduler/jobs/:id` | `scheduler:job:delete` | 删除任务 |
| PUT | `/api/scheduler/jobs/:id/start` | `scheduler:job:update` | 启动任务 |
| PUT | `/api/scheduler/jobs/:id/stop` | `scheduler:job:update` | 停止任务 |
| POST | `/api/scheduler/jobs/:id/execute` | `scheduler:job:update` | 立即执行一次 |
| GET | `/api/scheduler/logs` | `scheduler:job:list` | 查询执行日志 |

### 创建任务

```typescript
POST /api/scheduler/jobs
{
  "name": "清理过期会话",
  "handlerId": "cleanExpiredSessions",   // 对应 handlers 中的 key
  "cron": "0 0 3 * *",                   // Cron 表达式
  "params": { "maxAge": 86400 },         // 传递给 handler 的参数
  "description": "每天凌晨 3 点清理过期会话"
}
```

### 查询任务列表

```typescript
GET /api/scheduler/jobs?page=1&pageSize=10&status=1

// status: 0=暂停, 1=运行中
```

### 启停控制

```typescript
// 启动任务（注册到调度器）
PUT /api/scheduler/jobs/:id/start

// 停止任务（从调度器移除，保留配置）
PUT /api/scheduler/jobs/:id/stop

// 立即执行一次（不影响原有调度计划）
POST /api/scheduler/jobs/:id/execute
```

### 执行日志

```typescript
GET /api/scheduler/logs?jobId=xxx&page=1&pageSize=10
```

## 服务接口

通过 `schedulerModule.services.scheduler` 访问服务：

```typescript
// 列出任务
const result = await schedulerModule.services.scheduler.list({
  status: 1,   // 只查运行中的
  page: 1,
  pageSize: 20,
});

// 创建任务
const job = await schedulerModule.services.scheduler.create({
  name: '数据备份',
  handlerId: 'backupDatabase',
  cron: '0 2 * * *',
  description: '每天凌晨 2 点备份数据库',
});

// 启动任务
await schedulerModule.services.scheduler.start(job.id);

// 停止任务
await schedulerModule.services.scheduler.stop(job.id);
```

## 初始化行为

调用 `schedulerModule.init()` 时，模块会自动从数据库加载所有 `status=1`（运行中）的任务并注册到调度器。应用重启后无需手动恢复任务。
