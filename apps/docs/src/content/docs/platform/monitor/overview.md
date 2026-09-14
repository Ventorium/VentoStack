---
title: 系统监控概述
description: '系统监控模块提供跨平台运行指标、依赖健康状态和最近活动用户管理。'
---

## 访问与租户边界

所有监控接口都要求登录并校验对应权限。租户标识由服务端认证上下文确定，客户端不得提交 `tenantId`。最近活动用户的查询和强制下线定位均在 SQL 中限制当前租户，其他租户的数据不可见。

## 服务器状态

`GET /api/system/monitor/server` 返回 Bun 进程所在运行环境的信息：

```json
{
  "cpu": { "available": true, "model": "Apple M4", "cores": 10, "usage": 0.18 },
  "memory": { "available": true, "total": 17179869184, "used": 8589934592, "usage": 0.5 },
  "disk": { "available": true, "total": 245104738304, "used": 120000000000, "usage": 0.49, "mount": "/" },
  "os": { "platform": "darwin", "arch": "arm64", "hostname": "admin-host" },
  "process": {
    "pid": 1234,
    "uptime": 3600,
    "bunVersion": "1.3.10",
    "nodeCompatibilityVersion": "24.3.0",
    "rss": 134217728,
    "heapUsed": 67108864,
    "heapTotal": 100663296
  },
  "collectedAt": "2026-09-14T00:00:00.000Z"
}
```

- `usage` 统一为 `0～1` 比率，不是百分数。
- CPU 使用率通过两次 CPU time 快照差值计算，不使用 Windows 恒为零的 load average。
- 磁盘通过 `statfs` 读取当前工作目录所在根卷，不执行 `df`/`tail`，兼容 macOS、Windows 和 Linux。
- `process.uptime` 是应用进程运行时间，不是操作系统开机时间。
- `nodeCompatibilityVersion` 是 Bun 提供的 Node.js 兼容层版本。
- 指标无法采集时 `available=false`，数值零不得解释为真实的 0% 使用率。
- 容器内展示的是容器可见的文件系统与系统资源，并不等同于宿主机指标。

## 缓存状态

`GET /api/system/monitor/cache` 返回缓存采集器提供的统计。当前框架 `Cache` 接口没有暴露 Redis INFO，因此未配置统计提供者时返回：

```json
{ "available": false, "keyCount": 0, "memory": "0B" }
```

页面会显示“暂不支持采集”，不会把占位零值当成真实统计。提供者返回的 `hitRate` 必须是 `0～1` 比率。

## 数据源状态

`GET /api/system/monitor/datasource` 始终通过参数化 `SELECT 1` 探测连通性。若数据库抽象没有提供连接池统计，响应会明确区分连接状态和指标能力：

```json
{
  "connected": true,
  "metricsAvailable": false,
  "poolSize": 0,
  "activeConnections": 0,
  "idleConnections": 0
}
```

`metricsAvailable=false` 时三个数值是协议占位值，页面不展示为真实连接池数据。

## 健康检查

`GET /api/system/monitor/health` 聚合 readiness 检查，状态为 `UP`、`DEGRADED` 或 `DOWN`。页面分别使用绿色、橙色和红色展示。

## 最近活动用户

`GET /api/system/monitor/online` 先在本租户最近 30 分钟的成功认证活动中按用户去重，再与当前进程的有效设备会话求交集。每个用户只返回最后活跃的一条会话；已退出或被强制下线的用户不会继续显示。

`DELETE /api/system/monitor/online/{sessionId}` 会：

1. 从服务端 Session 存储读取会话归属，不信任客户端用户标识；
2. 在数据库中确认用户属于当前租户，拒绝不存在或跨租户的会话；
3. 调用统一认证会话管理器，撤销该用户的全部 Session、设备登录和已跟踪的刷新令牌。

路径参数是服务端返回的真实 Session ID。客户端不需要也不能提交 `userId` 作为授权依据。

## 平台接入扩展

monitor 模块允许在组合根注入 `systemMetricsProvider`、`cacheStatsProvider` 和 `dataSourceStatsProvider`。自定义提供者必须返回真实采集结果；不可用时应显式返回不可用状态，禁止用虚构的零值表示正常。
