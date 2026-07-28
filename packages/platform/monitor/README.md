# @ventostack/monitor

VentoStack Admin 的运行状态监控模块，为运维人员提供服务器、缓存、数据源、健康状态和在线会话视图。

## 核心能力

- 服务器、操作系统、进程和磁盘信息
- Redis 状态、Key 数量和内存统计
- 数据源连接状态
- 统一健康检查结果
- 在线用户分页查询
- 权限保护的管理路由和模块装配

## 使用边界

监控信息可能暴露内部拓扑和版本。生产环境必须通过认证、权限和网络边界保护相关端点。

```ts
import { createMonitorModule, type MonitorModuleDeps } from "@ventostack/monitor";

declare const deps: MonitorModuleDeps;
const monitor = createMonitorModule(deps);
```
