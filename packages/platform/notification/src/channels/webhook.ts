/**
 * Webhook 通知通道
 */

import type { NotifyChannel } from "../services/notification";

export interface WebhookChannelOptions {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export function createWebhookChannel(options: WebhookChannelOptions): NotifyChannel {
  return {
    name: "webhook",

    async send(params) {
      try {
        const response = await fetch(options.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
          body: JSON.stringify({
            to: params.to,
            title: params.title,
            content: params.content,
          }),
          signal: options.timeout
            ? AbortSignal.timeout(options.timeout)
            : undefined,
        });

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` };
        }
        return { success: true };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : "Webhook 发送失败" };
      }
    },
  };
}
