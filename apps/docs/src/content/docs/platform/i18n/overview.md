---
title: 国际化概述
description: '国际化模块提供多语言管理、翻译消息的 CRUD、按模块分组和批量导入能力，支持前端和后端的多语言切换。'
---

## 概述

`@ventostack/i18n` 是 VentoStack 平台层的国际化模块，支持管理多个语言环境、按模块组织翻译消息，提供消息的增删改查和批量导入能力。前端可通过 API 拉取完整语言包实现动态多语言切换。

## 快速开始

### 创建国际化模块

```typescript
import { createI18nModule } from '@ventostack/i18n';

const i18nModule = createI18nModule({
  db,
  jwt,
  jwtSecret,
  rbac,
});

// 注册路由
app.use(i18nModule.router);

// 初始化
await i18nModule.init();
```

### 模块依赖

```typescript
interface I18nModuleDeps {
  db: Database;          // 数据库实例
  jwt: JWTManager;       // JWT 管理器
  jwtSecret: string;     // JWT 密钥
  rbac?: RBAC;           // 权限控制（可选）
}
```

## API 路由

所有路由需要认证，基于 RBAC 权限控制。

### 语言管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/i18n/locales` | `i18n:locale:create` | 创建语言 |
| GET | `/api/i18n/locales` | `i18n:locale:list` | 查询语言列表 |
| PUT | `/api/i18n/locales/:id` | `i18n:locale:update` | 更新语言 |
| DELETE | `/api/i18n/locales/:id` | `i18n:locale:delete` | 删除语言（同时删除该语言下所有消息） |

### 消息管理

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/api/i18n/messages` | `i18n:message:list` | 查询消息列表（分页） |
| GET | `/api/i18n/messages/:locale` | `i18n:message:query` | 获取指定语言的全部消息（键值对） |
| POST | `/api/i18n/messages/set` | `i18n:message:create` | 设置单条消息（存在则更新） |
| POST | `/api/i18n/messages/import` | `i18n:message:create` | 批量导入消息 |
| DELETE | `/api/i18n/messages/:id` | `i18n:message:delete` | 删除消息 |

### 创建语言

```typescript
POST /api/i18n/locales
{
  "code": "zh-CN",
  "name": "简体中文",
  "isDefault": true
}

// 响应
{ "id": "uuid" }
```

### 查询语言列表

```typescript
GET /api/i18n/locales

// 响应（默认语言排在前面）
[
  { "id": "uuid", "code": "zh-CN", "name": "简体中文", "isDefault": true, "status": 1 },
  { "id": "uuid", "code": "en-US", "name": "English", "isDefault": false, "status": 1 }
]
```

### 设置单条消息

```typescript
POST /api/i18n/messages/set
{
  "locale": "zh-CN",
  "code": "common.save",
  "value": "保存",
  "module": "common"           // 可选，按模块分组
}

// 若 (locale, code) 已存在则更新 value
```

### 批量导入消息

```typescript
POST /api/i18n/messages/import
{
  "locale": "en-US",
  "module": "dashboard",
  "messages": {
    "dashboard.title": "Dashboard",
    "dashboard.welcome": "Welcome back",
    "dashboard.stats": "Statistics"
  }
}

// 响应
{ "count": 3 }
```

### 获取语言包

```typescript
GET /api/i18n/messages/:locale?module=common

// 响应（键值对，可直接用于前端 i18n 框架）
{
  "common.save": "保存",
  "common.cancel": "取消",
  "common.confirm": "确认"
}
```

### 查询消息列表（分页）

```typescript
GET /api/i18n/messages?locale=zh-CN&module=common&page=1&pageSize=20
```

## 服务接口

通过 `i18nModule.services.i18n` 访问服务：

```typescript
const svc = i18nModule.services.i18n;

// 创建语言
const { id } = await svc.createLocale({
  code: 'ja-JP',
  name: '日本語',
});

// 设置默认语言
await svc.updateLocale(id, { isDefault: true });

// 列出所有语言
const locales = await svc.listLocales();

// 设置单条消息
await svc.setMessage('zh-CN', 'form.required', '此项为必填项', 'form');

// 获取单条消息
const value = await svc.getMessage('zh-CN', 'form.required');

// 获取语言包（键值对）
const messages = await svc.getLocaleMessages('zh-CN', 'form');

// 批量导入
const count = await svc.importMessages('en-US', {
  'form.required': 'This field is required',
  'form.email': 'Email address',
  'form.password': 'Password',
}, 'form');

// 查询消息列表（分页）
const result = await svc.listMessages({
  locale: 'zh-CN',
  module: 'form',
  page: 1,
  pageSize: 20,
});

// 删除语言（同时删除该语言下所有消息）
await svc.deleteLocale(id);

// 删除单条消息
await svc.deleteMessage(messageId);
```

## 数据模型

### sys_i18n_locale（语言）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 |
| code | varchar(32) | 语言编码，如 `zh-CN`、`en-US` |
| name | varchar(128) | 语言名称 |
| is_default | boolean | 是否默认语言 |
| status | int | 状态：1=启用 |
| created_at / updated_at | timestamp | 自动时间戳 |

### sys_i18n_message（翻译消息）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar(36) | 主键 |
| locale | varchar(32) | 语言编码 |
| code | varchar(256) | 消息键，如 `common.save` |
| value | text | 翻译值 |
| module | varchar(64) | 所属模块（可空） |
| created_at / updated_at | timestamp | 自动时间戳 |

> 唯一约束：`(locale, code)` 组合唯一，使用 `ON CONFLICT` 实现 upsert 语义。
