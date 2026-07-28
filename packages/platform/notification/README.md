# @ventostack/notification

VentoStack 的统一通知平台模块，用于管理通知模板、发送记录、用户阅读状态和多通道投递。

## 核心能力

- 通知模板和消息记录管理
- 站内信通道及用户已读状态
- SMTP 邮件通道
- 可注入的短信发送通道
- Webhook 通知通道
- 失败记录、重试和状态跟踪
- 管理路由、迁移和模块装配

## 使用边界

通道凭据由应用安全注入。业务模块负责决定接收人和通知时机，本包不替代业务授权或营销合规判断。

```ts
import {
  createInAppChannel,
  createNotificationModule,
  type NotificationModuleDeps,
} from "@ventostack/notification";

declare const deps: Omit<NotificationModuleDeps, "channels">;
const notification = createNotificationModule({
  ...deps,
  channels: new Map([["in_app", createInAppChannel()]]),
});
```
