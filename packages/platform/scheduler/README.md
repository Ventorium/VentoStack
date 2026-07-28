# @ventostack/scheduler

VentoStack Admin 的持久化定时任务模块，用于管理任务定义、执行状态和运行日志。

## 核心能力

- 定时任务与执行日志模型
- Cron 任务创建、更新、启停和删除
- 任务处理器注册与调度
- 手动触发任务
- 执行成功、失败和耗时记录
- 管理路由、数据库迁移和模块装配

## 使用边界

任务处理器必须由应用显式注册。多实例部署时应配合分布式锁或调度协调，避免同一任务重复执行。

```ts
import { createSchedulerModule, type SchedulerModuleDeps } from "@ventostack/scheduler";

declare const deps: SchedulerModuleDeps;
const scheduler = createSchedulerModule(deps);
```
