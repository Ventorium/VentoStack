---
title: 消息中心概述
description: '消息中心模块提供统一的通知发送能力，支持 SMTP 邮件、短信和 Webhook 三种通知渠道。'
---

## 概述

`@ventostack/notification` 是 VentoStack 平台层的统一消息管理模块，支持通过频道适配器模式灵活扩展消息通道。内置 SMTP 邮件、短信和 Webhook 三种渠道。

## 架构

```
┌──────────────────────────────────────────┐
│         @ventostack/notification          │
├──────────────────────────────────────────┤
│           消息分发器 (Dispatcher)          │
│  ┌──────────┬──────────┬──────────────┐  │
│  │   SMTP   │   SMS    │   Webhook    │  │
│  │ Channel  │ Channel  │   Channel    │  │
│  └──────────┴──────────┴──────────────┘  │
├──────────────────────────────────────────┤
│  @ventostack/database (消息持久化)        │
│  @ventostack/auth (认证鉴权)              │
└──────────────────────────────────────────┘
```

## 快速开始

### 创建通知模块

```typescript
import { createNotificationModule } from '@ventostack/notification';
import { createSMTPChannel, createSMSChannel, createWebhookChannel } from '@ventostack/notification';

// 创建频道
const smtpChannel = createSMTPChannel({
  host: 'smtp.example.com',
  port: 465,
  secure: true,
  auth: { user: 'noreply@example.com', pass: process.env.SMTP_PASSWORD },
});

const smsChannel = createSMSChannel({
  provider: 'aliyun',
  accessKeyId: process.env.SMS_ACCESS_KEY,
  accessKeySecret: process.env.SMS_SECRET_KEY,
});

// 注册频道到 Map
const channels = new Map<string, NotifyChannel>();
channels.set('smtp', smtpChannel);
channels.set('sms', smsChannel);

// 创建模块
const notification = createNotificationModule({
  db, jwt, jwtSecret, rbac,
  channels,
});

// 注册路由
app.use(notification.router);
```

## 频道接口

所有频道实现 `NotifyChannel` 接口：

```typescript
interface NotifyChannel {
  name: string;
  send(params: {
    to: string;
    title: string;
    content: string;
  }): Promise<{ success: boolean; error?: string }>;
}
```

### 内置频道

| 频道 | 工厂函数 | 说明 |
|------|----------|------|
| SMTP 邮件 | `createSMTPChannel` | 支持标准 SMTP 协议 |
| 短信 | `createSMSChannel` | 支持多种短信服务商 |
| Webhook | `createWebhookChannel` | HTTP 回调通知 |

### 自定义频道

实现 `NotifyChannel` 接口即可注册自定义频道：

```typescript
const customChannel: NotifyChannel = {
  name: 'dingtalk',
  async send({ to, title, content }) {
    const res = await fetch(process.env.DINGTALK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content: `${title}: ${content}` } }),
    });
    return { success: res.ok };
  },
};

channels.set('dingtalk', customChannel);
```

## API 路由

所有路由前缀 `/api/notification`，需要认证：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/notification/send` | 发送通知 |
| GET | `/api/notification/messages` | 查询消息列表 |
| GET | `/api/notification/messages/unread-count` | 未读数量 |
| PUT | `/api/notification/messages/:id/read` | 标记已读 |
| PUT | `/api/notification/messages/read-all` | 全部已读 |
| GET | `/api/notification/templates` | 模板列表 |
| POST | `/api/notification/templates` | 创建模板 |
| PUT | `/api/notification/templates/:id` | 更新模板 |
| DELETE | `/api/notification/templates/:id` | 删除模板 |

## 服务接口

通过 `notification.services.notification` 访问通知服务：

```typescript
// 发送通知
await notification.services.notification.send({
  templateId: 'tpl-001',
  receiverId: 'user-001',
  channel: 'smtp',
  variables: { username: '张三', appName: 'VentoStack' },
});

// 直接发送（不使用模板）
await notification.services.notification.send({
  receiverId: 'user-001',
  channel: 'smtp',
  title: '系统通知',
  content: '您的密码将在 7 天后过期',
});
```
