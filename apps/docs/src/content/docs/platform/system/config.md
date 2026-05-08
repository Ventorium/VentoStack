---
order: 8
title: 系统参数
description: '系统参数模块提供运行时配置的 CRUD 管理，支持缓存加速，与框架层配置 (app.yaml) 互补。'
---

## 概述

系统参数（`sys_config`）提供可在线管理的运行时配置能力。与框架层的 `app.yaml` 静态配置不同，系统参数存储在数据库中，支持热更新，无需重启服务。

## 与框架层配置的区别

| 特性 | 框架层配置 (app.yaml) | 系统参数 (sys_config) |
|------|----------------------|---------------------|
| 存储位置 | 文件系统 | 数据库 |
| 修改方式 | 编辑文件 + 重启 | API 在线修改 |
| 生效时机 | 应用启动时 | 实时生效（带缓存） |
| 适用场景 | 数据库连接、端口、密钥 | 业务开关、功能配置 |
| 类型安全 | 编译期校验 | 运行时 Schema 校验 |
| 多租户 | 不区分租户 | 按 tenant_id 隔离 |

## CRUD 操作

### 创建参数

```typescript
POST /api/system/config
{
  "name": "sys.account.register",
  "label": "账号注册开关",
  "value": "true",
  "type": "boolean",       // string | number | boolean | json
  "remark": "控制是否开放用户自主注册功能"
}
```

### 查询参数

```typescript
GET /api/system/config?page=1&pageSize=10&name=sys.account

// 响应
{
  "total": 20,
  "rows": [
    {
      "id": "cfg-001",
      "name": "sys.account.register",
      "label": "账号注册开关",
      "value": "true",
      "type": "boolean",
      "remark": "控制是否开放用户自主注册功能",
      "updatedAt": "2024-06-01T12:00:00Z"
    }
  ]
}
```

### 更新参数

```typescript
PUT /api/system/config/{id}
{
  "value": "false"       // 关闭注册
}

// 更新后自动清除缓存，下次读取时从数据库刷新
```

### 删除参数

```typescript
DELETE /api/system/config/{id}

// 内置参数（name 以 sys. 开头）不可删除
```

## 运行时值获取

系统参数通过带缓存的 Service 方法获取，避免频繁查询数据库。

### Service API

```typescript
const configService = createConfigService({ db, cache });

// 获取参数值（自动类型转换）
const registerEnabled = await configService.getBoolean('sys.account.register');
// → true

const maxUploadSize = await configService.getNumber('sys.upload.maxSize');
// → 5242880

const smtpConfig = await configService.getJson('sys.mail.smtp');
// → { host: 'smtp.example.com', port: 465, ssl: true }

const appName = await configService.getString('sys.app.name');
// → 'VentoStack'
```

### 缓存策略

```typescript
// 缓存 Key: config:{tenantId}:{name}
// TTL: 无过期时间，变更时主动失效

async function getConfigValue(name: string, tenantId: string): Promise<string | null> {
  const cacheKey = `config:${tenantId}:${name}`;

  // 1. 查询缓存
  const cached = await cache.get(cacheKey);
  if (cached !== null) return cached;

  // 2. 查询数据库
  const row = await db.query`
    SELECT value FROM sys_config
    WHERE name = ${name} AND tenant_id = ${tenantId}
  `;

  if (row.length === 0) return null;

  // 3. 写入缓存
  await cache.set(cacheKey, row[0].value);

  return row[0].value;
}

// 缓存失效
async function invalidateConfigCache(name: string, tenantId: string) {
  await cache.del(`config:${tenantId}:${name}`);
}
```

## 内置参数

以下是系统预置的标准参数（`sys.` 前缀的参数为系统内置，不可删除）：

| 参数名 | 默认值 | 说明 |
|--------|--------|------|
| `sys.account.register` | `true` | 是否开放用户注册 |
| `sys.account.captcha` | `true` | 登录是否需要验证码 |
| `sys.account.resetPassword` | `true` | 是否开放密码自助重置 |
| `sys.user.initPassword` | `123456` | 用户初始密码 |
| `sys.upload.maxSize` | `5242880` | 上传文件最大字节数（5MB） |
| `sys.upload.allowedTypes` | `jpg,jpeg,png,gif,pdf,doc,docx` | 允许的文件类型 |
| `sys.mail.smtp` | `{}` | SMTP 配置（JSON） |
| `sys.app.name` | `VentoStack` | 应用名称 |
| `sys.app.logo` | `` | 应用 Logo URL |

## 在业务代码中使用

```typescript
import { createConfigService } from '@ventostack/system';

// 在路由处理器中读取配置
app.post('/api/register', async (ctx) => {
  const registerEnabled = await configService.getBoolean('sys.account.register');
  if (!registerEnabled) {
    return ctx.json({ error: 'registration_disabled' }, 403);
  }

  const captchaEnabled = await configService.getBoolean('sys.account.captcha');
  if (captchaEnabled) {
    await verifyCaptcha(ctx.body.captchaId, ctx.body.captchaCode);
  }

  // ... 注册逻辑
});
```
