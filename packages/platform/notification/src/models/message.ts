/**
 * 通知消息模型
 */

import { defineModel, column } from "@ventostack/database";

export const NotifyMessageModel = defineModel("sys_notify_message", {
  id: column.varchar({ primary: true, length: 36 }),
  template_id: column.varchar({ length: 36, nullable: true }),
  channel: column.varchar({ length: 32 }),
  receiver_id: column.varchar({ length: 36 }),
  title: column.varchar({ length: 256, nullable: true }),
  content: column.text(),
  variables: column.json({ nullable: true }),
  status: column.int({ default: 0 }),
  retry_count: column.int({ default: 0 }),
  send_at: column.timestamp({ nullable: true }),
  error: column.text({ nullable: true }),
}, { timestamps: true });
