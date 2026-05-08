---
order: 9
title: 多端登录管理
description: 使用 createMultiDeviceManager 实现多设备登录限制与溢出策略
---

`createMultiDeviceManager` 提供了多端登录管理能力，支持设备总数限制、同类型设备限制和溢出策略（拒绝登录或踢掉最老设备）。基于内存 Map 存储用户设备会话。

## 基本用法

```typescript
import { createMultiDeviceManager } from "@ventostack/auth";

const dm = createMultiDeviceManager({
  maxDevices: 5,              // 每用户最大设备数
  maxPerType: 2,              // 每种设备类型最大数
  overflowStrategy: "kick-oldest", // 超出时踢掉最老设备
});

// 用户登录
const result = await dm.login("user-1", {
  sessionId: "sess-abc",
  userId: "user-1",
  deviceType: "web",
  deviceName: "Chrome / macOS",
  ip: "192.168.1.1",
});

console.log(result.allowed); // true
console.log(result.kicked);  // undefined（未超出限制）
```

## 溢出策略

当设备数超出限制时，根据 `overflowStrategy` 决定行为：

| 策略 | 行为 |
|------|------|
| `kick-oldest`（默认） | 按 `lastActiveAt` 踢掉最老的设备，返回被踢 sessionId 列表 |
| `reject` | 直接拒绝登录，返回 `{ allowed: false }` |

```typescript
// 当 maxPerType=2 且已有 2 个 web 设备时
const result = await dm.login("user-1", {
  sessionId: "sess-new",
  userId: "user-1",
  deviceType: "web",
});

// overflowStrategy: "kick-oldest" 时
// result = { allowed: true, kicked: ["sess-oldest"] }

// overflowStrategy: "reject" 时
// result = { allowed: false }
```

## 设备会话管理

```typescript
// 注销单个设备
dm.logout("user-1", "sess-abc");

// 注销用户的所有设备
dm.logoutAll("user-1");

// 获取用户所有设备会话
const sessions = dm.getSessions("user-1");

// 获取活跃设备数
const count = dm.getActiveDeviceCount("user-1");

// 更新设备活跃时间（续期）
dm.touch("user-1", "sess-abc");

// 验证会话是否有效
const valid = dm.isSessionValid("user-1", "sess-abc"); // true/false
```

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxDevices` | `number` | `5` | 每个用户的最大设备总数 |
| `maxPerType` | `number` | `2` | 每种设备类型的最大设备数 |
| `deviceTypes` | `string[]` | — | 允许的设备类型列表 |
| `overflowStrategy` | `"reject" \| "kick-oldest"` | `"kick-oldest"` | 超出限制时的处理策略 |

## 接口参考

```typescript
interface DeviceSession {
  sessionId: string;
  userId: string;
  deviceType: string;     // 如 "web", "ios", "android"
  deviceName?: string;
  ip?: string;
  userAgent?: string;
  createdAt: number;
  lastActiveAt: number;
}

interface MultiDeviceManager {
  login(userId: string, device: Omit<DeviceSession, "createdAt" | "lastActiveAt">): Promise<{ allowed: boolean; kicked?: string[] }>;
  logout(userId: string, sessionId: string): void;
  logoutAll(userId: string): void;
  getSessions(userId: string): DeviceSession[];
  getActiveDeviceCount(userId: string): number;
  touch(userId: string, sessionId: string): void;
  isSessionValid(userId: string, sessionId: string): boolean;
}
```

## 注意事项

- 设备会话基于内存 Map 存储，重启后丢失，需配合持久化 Session 一起使用
- 同类型设备限制先于总设备数限制检查，两种限制可叠加生效
- `kick-oldest` 策略按 `lastActiveAt` 排序，长时间未活跃的设备优先被踢出
