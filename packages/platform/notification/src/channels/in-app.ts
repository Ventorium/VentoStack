/**
 * 站内信通知通道
 * 消息已由 NotificationService 存入数据库，此处仅记录日志
 */

import type { NotifyChannel } from "../services/notification";

export function createInAppChannel(): NotifyChannel {
  return {
    name: "in_app",

    async send(_params) {
      // 站内信通过数据库直接存储，不需要额外投递
      return { success: true };
    },
  };
}
