# @ventostack/events

VentoStack 的事件、队列和任务协调基础设施，用于解耦同步业务流程与异步处理。

## 核心能力

- 类型化事件定义与内存事件总线
- 内存消息队列、延迟队列和事件队列
- 领域事件注册与内存事件存储
- MQ 适配器及可靠投递策略
- 本地和分布式任务调度
- Saga 与 TCC 事务协调
- 任务状态、执行日志和运行监控

## 使用边界

本包提供通用机制，不替业务模块定义事件语义。跨进程可靠性取决于接入的持久化 MQ、锁和存储实现。

```ts
import { createEventBus, defineEvent } from "@ventostack/events";

const userCreated = defineEvent<{ userId: string }>("user.created");
const bus = createEventBus();
bus.on(userCreated, async ({ userId }) => console.log(userId));
```
