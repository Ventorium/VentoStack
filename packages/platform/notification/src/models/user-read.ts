/**
 * 用户已读记录模型
 */

import { defineModel, column } from "@ventostack/database";

export const NotifyUserReadModel = defineModel("sys_notify_user_read", {
  id: column.varchar({ primary: true, length: 36 }),
  user_id: column.varchar({ length: 36 }),
  message_id: column.varchar({ length: 36 }),
  read_at: column.timestamp(),
}, { timestamps: false });
