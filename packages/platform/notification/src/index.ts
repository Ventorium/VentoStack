/**
 * @ventostack/notify — 通知中心
 *
 * 多通道消息发送、模板管理、已读状态追踪。
 */

// Models
export { NotifyTemplateModel } from "./models/template";
export { NotifyMessageModel } from "./models/message";
export { NotifyUserReadModel } from "./models/user-read";

// Services
export { createNotificationService } from "./services/notification";
export type {
  NotifyChannel,
  NotifyTemplate,
  NotifyMessage,
  PaginatedResult,
  NotificationService,
  NotificationServiceDeps,
} from "./services/notification";
export { MessageStatus, TemplateStatus } from "./services/notification";

// Channels
export { createSMTPChannel } from "./channels/smtp";
export type { SMTPChannelOptions } from "./channels/smtp";
export { createSMSChannel } from "./channels/sms";
export type { SMSChannelOptions } from "./channels/sms";
export { createWebhookChannel } from "./channels/webhook";
export type { WebhookChannelOptions } from "./channels/webhook";

// Routes
export { createNotificationRoutes } from "./routes/notification";

// Module
export { createNotificationModule } from "./module";
export type { NotificationModule, NotificationModuleDeps } from "./module";

// Migrations
export { createNotifyTables } from "./migrations/001_create_notify_tables";

// In-App Channel
export { createInAppChannel } from "./channels/in-app";
