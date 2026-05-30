---
order: 1
title: Admin 管理后台概述
description: VentoStack Admin 是基于框架层和平台层构建的企业级管理后台，提供完整的前后端实现。
---

## 概述

VentoStack Admin 是一个开箱即用的企业级管理后台应用，基于以下技术栈构建：

- **后端**：`@ventostack/core` + `@ventostack/platform`（Composition Root 模式）
- **前端**：React 18 + Ant Design 5 + UnoCSS + Zustand
- **数据库**：PostgreSQL（通过 `@ventostack/database`）
- **缓存**：Redis / 内存（通过 `@ventostack/cache`）

## 架构总览

```
┌─────────────────────────────────────────────────┐
│                  Admin Frontend                  │
│   React + Ant Design + UnoCSS + Zustand          │
│   Type-safe API Client (OpenAPI 生成)             │
├─────────────────────────────────────────────────┤
│                  Admin Backend                   │
│   Composition Root (index.ts → app.ts)           │
│   createPlatform() 聚合所有平台模块               │
├─────────────────────────────────────────────────┤
│              @ventostack/platform                │
│  system │ gen │ monitor │ i18n │ oss │ scheduler │
│  notification │ workflow │ auth                  │
├─────────────────────────────────────────────────┤
│             @ventostack/framework                │
│  core │ database │ cache │ events │ observability│
│  openapi │ testing │ webhook                     │
├─────────────────────────────────────────────────┤
│               Bun Runtime                        │
└─────────────────────────────────────────────────┘
```

## 功能模块

| 模块 | 路由前缀 | 说明 |
|------|----------|------|
| 用户管理 | `/api/system/users` | 增删改查、密码重置、状态控制 |
| 角色管理 | `/api/system/roles` | RBAC 角色分配、权限树 |
| 菜单管理 | `/api/system/menus` | 动态菜单、按钮权限 |
| 部门管理 | `/api/system/depts` | 组织架构树、数据权限 |
| 岗位管理 | `/api/system/posts` | 职务字典 |
| 字典管理 | `/api/system/dict` | 数据字典类型与字典项 |
| 参数配置 | `/api/system/configs` | 系统参数键值对 |
| 通知公告 | `/api/system/notices` | 公告发布与查看 |
| 操作日志 | `/api/system/op-logs` | 审计日志记录 |
| 登录日志 | `/api/system/login-logs` | 登录审计 |
| 代码生成 | `/api/system/gen` | 表导入、模板配置、代码生成 |
| 文件管理 | `/api/system/oss` | 上传、下载、文件管理 |
| 定时任务 | `/api/system/scheduler` | Cron 任务管理与日志 |
| 系统监控 | `/api/system/monitor` | 服务器/缓存/健康状态 |
| 消息中心 | `/api/notification/messages` | 多通道通知管理 |
| 国际化 | `/api/i18n/locales` | 多语言资源管理 |

## 快速启动

```bash
# 安装依赖
bun install

# 启动后端（端口 9320）
bun run dev:admin

# 启动前端（端口 9321，代理 API 到 9320）
bun run dev:admin:web
```

访问 http://localhost:9321，默认管理员账号：`admin` / `admin123`。
