---
order: 2
title: 认证业务
description: '系统管理模块的认证业务流程，涵盖登录、注册、密码重置、令牌轮换、多因素认证、强制下线等完整认证链路。'
---

## 概述

系统管理模块的认证业务基于 `@ventostack/auth` 框架能力，封装了面向终端用户的完整认证流程，包括暴力破解防护、令牌轮换、多因素认证等安全特性。

## 登录流程

### 标准登录

```
客户端                    服务端                      Redis
  │                        │                          │
  │  POST /auth/login      │                          │
  │  { username, password }│                          │
  │ ──────────────────────>│                          │
  │                        │  检查登录失败次数           │
  │                        │ ─────────────────────────>│
  │                        │  GET login_fail:{ip}      │
  │                        │ <─────────────────────────│
  │                        │                          │
  │                        │  验证密码 (Bun.password)   │
  │                        │  生成 AccessToken         │
  │                        │  生成 RefreshToken        │
  │                        │  存储会话                  │
  │                        │ ─────────────────────────>│
  │                        │                          │
  │  { accessToken,        │                          │
  │    refreshToken,       │                          │
  │    expiresIn }         │                          │
  │ <──────────────────────│                          │
```

### 暴力破解防护

每个敏感端点都配置了独立的限流策略：

| 端点 | 限流策略 | 说明 |
|------|---------|------|
| `POST /auth/login` | 5 次/分钟/IP + 10 次/5分钟/账户 | 超出后锁定账户 30 分钟 |
| `POST /auth/register` | 3 次/小时/IP | 防止批量注册 |
| `POST /auth/password/reset` | 3 次/小时/账户 | 防止滥用重置 |
| `POST /auth/token/refresh` | 20 次/分钟/账户 | 允许合理重试 |
| `POST /auth/mfa/verify` | 5 次/分钟/账户 | TOTP 验证限流 |

登录失败处理：

```typescript
// 连续失败处理逻辑
async function handleLoginFailure(username: string, ip: string) {
  const failCount = await cache.incr(`login_fail:${username}`);
  if (failCount >= 5) {
    // 锁定账户 30 分钟
    await cache.set(`account_locked:${username}`, '1', { ttl: 1800 });
    await auditLog.warn('account_locked', { username, ip, failCount });
  }
}
```

## 注册流程

```typescript
POST /api/system/auth/register
{
  "username": "string",      // 4-30 字符，字母数字下划线
  "password": "string",      // 至少 8 位，包含大小写字母和数字
  "email": "string",         // 合法邮箱格式
  "captchaId": "string",     // 验证码 ID
  "captchaCode": "string"    // 验证码值
}
```

注册流程包含：
1. 输入校验（Schema 校验 + 业务规则）
2. 验证码校验（防止机器人注册）
3. 用户名/邮箱唯一性检查
4. 密码哈希（使用 `Bun.password.hash`，算法 argon2id）
5. 创建用户记录（默认状态为待激活）
6. 发送激活邮件

## 密码重置

### 用户自助重置

通过邮箱验证码重置密码：

```
1. POST /auth/password/reset/request  → 发送重置邮件
2. POST /auth/password/reset/confirm  → 验证 token 并重置
```

重置 Token 有效期 30 分钟，使用后立即失效。

### 管理员重置

```typescript
POST /api/system/user/{id}/password/reset
Authorization: Bearer <admin_token>

// 管理员重置后生成临时密码，用户首次登录必须修改
```

## Refresh Token 轮换

采用 Refresh Token 轮换机制，每次刷新时签发新的 Refresh Token，旧 Token 立即失效：

```typescript
// Token 刷新逻辑
async function refreshTokens(oldRefreshToken: string) {
  // 1. 验证旧 Refresh Token 签名和有效性
  const payload = verifyRefreshToken(oldRefreshToken);

  // 2. 检查 Token 是否已被撤销（Redis 黑名单）
  const isRevoked = await cache.get(`rt_revoked:${payload.jti}`);
  if (isRevoked) {
    // 检测到重放攻击，撤销该用户所有 Refresh Token
    await revokeAllUserRefreshTokens(payload.sub);
    throw new SecurityError('token_reuse_detected');
  }

  // 3. 撤销旧 Token
  await cache.set(`rt_revoked:${payload.jti}`, '1', {
    ttl: payload.exp - Date.now() / 1000
  });

  // 4. 签发新的 Token 对
  const newAccessToken = signAccessToken(payload.sub, payload.tenantId);
  const newRefreshToken = signRefreshToken(payload.sub, payload.tenantId);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
```

## 多因素认证 (TOTP)

### 启用 MFA

```
1. POST /auth/mfa/setup     → 返回 TOTP Secret + QR Code URL
2. POST /auth/mfa/verify    → 用户输入 TOTP 码完成绑定
```

### MFA 登录流程

启用 MFA 后，登录分为两步：

```
1. POST /auth/login                    → 返回 mfaRequired: true + mfaToken
2. POST /auth/mfa/verify-login         → 提交 TOTP 码 + mfaToken → 返回完整 Token 对
```

`mfaToken` 是短期 Token（有效期 5 分钟），仅用于 MFA 验证环节。

## 强制下线

### 管理员踢人

```typescript
POST /api/system/user/{id}/kick
Authorization: Bearer <admin_token>

// 效果：
// 1. 撤销该用户所有 Refresh Token
// 2. 将 AccessToken 加入黑名单（Redis，TTL = Token 剩余有效期）
// 3. 记录审计日志
```

### 批量下线

```typescript
POST /api/system/user/kick-batch
{
  "userIds": ["id1", "id2", "id3"]
}
```

## 限流配置

所有认证端点的限流通过 `@ventostack/core` 的限流中间件实现，使用 Redis 作为后端存储：

```typescript
const systemAuth = createSystemAuth({
  rateLimiter: {
    login: { windowMs: 60_000, max: 5 },         // 5 次/分钟
    register: { windowMs: 3_600_000, max: 3 },    // 3 次/小时
    passwordReset: { windowMs: 3_600_000, max: 3 },
    mfaVerify: { windowMs: 60_000, max: 5 },
  },
  tokenConfig: {
    accessTokenTtl: 900,           // 15 分钟
    refreshTokenTtl: 604_800,      // 7 天
    mfaTokenTtl: 300,              // 5 分钟
  },
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireDigit: true,
    requireSpecialChar: false,
    maxAge: 90 * 24 * 3600,        // 90 天强制更换
  },
});
```
