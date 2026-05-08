---
order: 10
title: 统一认证会话
description: 使用 createAuthSessionManager 聚合 Session、设备登录与 Token 生命周期管理
---

`createAuthSessionManager` 是统一认证会话管理器，聚合了 Session 管理、多端设备管理和 Token 刷新能力，提供完整的登录 / 登出 / 强制登出 / Token 刷新流程。

## 基本用法

```typescript
import {
  createAuthSessionManager,
  createSessionManager,
  createMemorySessionStore,
  createMultiDeviceManager,
  createTokenRefresh,
  createJWT,
} from "@ventostack/auth";

const jwt = createJWT({ secret: "your-secret-key" });
const tokenRefresh = createTokenRefresh(jwt);
const store = createMemorySessionStore();
const sessionManager = createSessionManager(store, { ttl: 3600 });
const deviceManager = createMultiDeviceManager({ maxDevices: 5 });

const auth = createAuthSessionManager({
  sessionManager,
  deviceManager,
  tokenRefresh,
  jwt,
  jwtSecret: "your-secret-key",
  jwtOptions: { expiresIn: 3600 },
});
```

## 登录

```typescript
const result = await auth.login({
  userId: "user-1",
  device: {
    sessionId: "auto",
    userId: "user-1",
    deviceType: "web",
    deviceName: "Chrome",
  },
  tokenPayload: { roles: ["admin"] },
  sessionData: { ip: "192.168.1.1" },
});

console.log(result.sessionId);
console.log(result.accessToken);
console.log(result.refreshToken);
console.log(result.expiresIn);
console.log(result.refreshExpiresIn);
```

登录流程会自动：
1. 创建服务端 Session
2. 注册设备（超出设备限制时踢掉最老设备）
3. 生成 Access Token + Refresh Token 对

## 登出

```typescript
// 单设备登出
await auth.logout("user-1", "sess-abc", "refresh-token-jti");

// 强制登出所有设备
const { sessions, devices } = await auth.forceLogout("user-1");
console.log(`销毁了 ${sessions} 个会话，${devices} 个设备`);
```

`forceLogout` 会自动销毁所有 Session、移除所有设备、吊销所有 Refresh Token。

## Token 刷新

```typescript
const newTokens = await auth.refreshTokens(oldRefreshToken, "your-secret-key");

console.log(newTokens.accessToken);
console.log(newTokens.refreshToken);
```

刷新时自动更新对应 Session 和设备的活跃时间。

## 配置选项

| 参数 | 类型 | 说明 |
|------|------|------|
| `sessionManager` | `SessionManager` | Session 管理器实例 |
| `deviceManager` | `MultiDeviceManager` | 多端设备管理器实例 |
| `tokenRefresh` | `TokenRefreshManager` | Token 刷新管理器实例 |
| `jwt` | `JWTManager` | JWT 管理器实例 |
| `jwtSecret` | `string` | JWT 签名密钥 |
| `jwtOptions` | `{ expiresIn?, algorithm? }` | JWT 可选配置 |

## 接口参考

```typescript
interface AuthSessionManager {
  login(params: {
    userId: string;
    device: Omit<DeviceSession, "createdAt" | "lastActiveAt">;
    tokenPayload: Record<string, unknown>;
    sessionData?: Record<string, unknown>;
  }): Promise<{
    sessionId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
  }>;

  logout(userId: string, sessionId: string, refreshTokenJti?: string): Promise<void>;
  forceLogout(userId: string): Promise<{ sessions: number; devices: number }>;
  refreshTokens(refreshToken: string, secret: string): Promise<TokenPair>;
}
```

## 注意事项

- 该管理器不直接存储数据，而是组合依赖的子管理器，需确保子管理器的存储后端一致
- 被踢掉的设备对应的 Session 会被自动销毁
- `forceLogout` 通过内部跟踪的 Refresh Token JTI 索引实现吊销，仅吊销由本实例签发的 Token
