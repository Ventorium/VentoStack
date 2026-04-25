/**
 * @ventostack/webhook - 出站 Webhook 管理器
 * 支持订阅管理、HMAC 签名投递、指数退避重试、死信队列
 */

import type {
  OutboundManagerOptions,
  OutboundWebhookManager,
  WebhookDelivery,
  WebhookEvent,
  WebhookSubscription,
} from "./types";
import { exponentialBackoff, hmacSign } from "./crypto";

/**
 * 创建出站 Webhook 管理器
 * @param options 管理器配置
 * @returns 出站管理器实例
 */
export function createOutboundWebhookManager(
  options?: OutboundManagerOptions,
): OutboundWebhookManager {
  const maxRetries = options?.maxRetries ?? 5;
  const retryInterval = options?.retryInterval ?? 1000;
  const maxRetryInterval = options?.maxRetryInterval ?? 60000;
  const deliveryTimeout = options?.deliveryTimeout ?? 10000;
  const algorithm = options?.signatureAlgorithm ?? "sha256";
  const signatureHeader = options?.signatureHeader ?? "X-Webhook-Signature";
  const doFetch = options?.fetch ?? fetch;

  const subscriptions = new Map<string, WebhookSubscription>();
  const deliveries = new Map<string, WebhookDelivery>();

  const retryQueue: string[] = [];
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function subscribe(
    config: Omit<WebhookSubscription, "id" | "createdAt">,
  ): string {
    const id = crypto.randomUUID();
    const sub: WebhookSubscription = {
      ...config,
      id,
      createdAt: Date.now(),
    };
    subscriptions.set(id, sub);
    return id;
  }

  function unsubscribe(subscriptionId: string): boolean {
    return subscriptions.delete(subscriptionId);
  }

  function getSubscription(subscriptionId: string): WebhookSubscription | undefined {
    return subscriptions.get(subscriptionId);
  }

  function listSubscriptions(filter?: {
    event?: string;
    active?: boolean;
  }): WebhookSubscription[] {
    let result = Array.from(subscriptions.values());
    if (filter?.event) {
      result = result.filter(
        (s) => s.events.length === 0 || s.events.includes(filter.event!),
      );
    }
    if (filter?.active !== undefined) {
      result = result.filter((s) => s.active === filter.active);
    }
    return result;
  }

  function signPayload(payload: unknown, secret: string): string {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    return hmacSign(body, secret, algorithm);
  }

  function scheduleRetry(): void {
    if (retryTimer !== null || retryQueue.length === 0) return;
    const now = Date.now();
    const nextDelivery = deliveries.get(retryQueue[0]!);
    if (!nextDelivery || !nextDelivery.nextRetryAt) return;
    const delay = Math.max(0, nextDelivery.nextRetryAt - now);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void processRetryQueue();
    }, delay);
    // 不阻止进程退出
    if (typeof retryTimer === "object" && "unref" in retryTimer) {
      retryTimer.unref();
    }
  }

  async function processRetryQueue(): Promise<void> {
    const now = Date.now();
    const toRetry: string[] = [];

    while (retryQueue.length > 0) {
      const deliveryId = retryQueue[0]!;
      const delivery = deliveries.get(deliveryId);
      if (!delivery || !delivery.nextRetryAt || delivery.nextRetryAt > now) break;
      retryQueue.shift();
      toRetry.push(deliveryId);
    }

    await Promise.allSettled(toRetry.map((id) => executeDelivery(id)));
    scheduleRetry();
  }

  async function executeDelivery(deliveryId: string): Promise<void> {
    const delivery = deliveries.get(deliveryId);
    if (!delivery || delivery.status === "dead" || delivery.status === "sent") return;

    const sub = subscriptions.get(delivery.subscriptionId);
    if (!sub || !sub.active) {
      delivery.status = "dead";
      delivery.error = "Subscription not found or inactive";
      return;
    }

    delivery.attempts++;
    delivery.lastAttemptAt = Date.now();
    delivery.status = "pending";

    const body =
      typeof delivery.payload === "string"
        ? delivery.payload
        : JSON.stringify(delivery.payload);
    const signature = hmacSign(body, sub.secret, algorithm);
    delivery.signature = `${algorithm}=${signature}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), deliveryTimeout);

      const response = await doFetch(sub.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [signatureHeader]: delivery.signature,
          ...sub.headers,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      delivery.statusCode = response.status;

      if (response.status >= 200 && response.status < 300) {
        delivery.status = "sent";
      } else {
        delivery.error = `HTTP ${response.status}`;
        handleFailure(delivery, deliveryId);
      }
    } catch (err) {
      delivery.error = err instanceof Error ? err.message : String(err);
      handleFailure(delivery, deliveryId);
    }
  }

  function handleFailure(delivery: WebhookDelivery, deliveryId: string): void {
    if (delivery.attempts >= delivery.maxAttempts) {
      delivery.status = "dead";
    } else {
      delivery.status = "failed";
      delivery.nextRetryAt =
        Date.now() +
        exponentialBackoff(delivery.attempts - 1, retryInterval, maxRetryInterval);
      retryQueue.push(deliveryId);
      retryQueue.sort((a, b) => {
        const da = deliveries.get(a);
        const db = deliveries.get(b);
        return (da?.nextRetryAt ?? Infinity) - (db?.nextRetryAt ?? Infinity);
      });
    }
  }

  async function send(
    event: string,
    payload: unknown,
    context?: { source?: string; metadata?: Record<string, unknown>; eventId?: string; eventTimestamp?: number },
  ): Promise<string[]> {
    const matchingSubs = listSubscriptions({ event, active: true });
    const deliveryIds: string[] = [];

    for (const sub of matchingSubs) {
      const id = crypto.randomUUID();
      const delivery: WebhookDelivery = {
        id,
        subscriptionId: sub.id,
        event,
        payload,
        status: "pending",
        attempts: 0,
        maxAttempts: maxRetries,
        createdAt: Date.now(),
        ...(context?.source ? { source: context.source } : {}),
        ...(context?.metadata ? { eventMetadata: context.metadata } : {}),
        ...(context?.eventId ? { eventId: context.eventId } : {}),
        ...(context?.eventTimestamp ? { eventTimestamp: context.eventTimestamp } : {}),
      };
      deliveries.set(id, delivery);
      deliveryIds.push(id);
    }

    await Promise.allSettled(deliveryIds.map((id) => executeDelivery(id)));
    return deliveryIds;
  }

  async function sendEvent(event: WebhookEvent): Promise<string[]> {
    const context: { source?: string; metadata?: Record<string, unknown>; eventId?: string; eventTimestamp?: number } = {
      source: event.source,
      eventId: event.id,
      eventTimestamp: event.timestamp,
    };
    if (event.metadata) context.metadata = event.metadata;
    return send(event.type, event.payload, context);
  }

  async function retry(): Promise<number> {
    const failed = Array.from(deliveries.values()).filter(
      (d) => d.status === "failed",
    );
    let retried = 0;

    for (const delivery of failed) {
      if (delivery.attempts >= delivery.maxAttempts) {
        delivery.status = "dead";
        continue;
      }
      await executeDelivery(delivery.id);
      if (delivery.status === "sent") {
        retried++;
      }
    }

    return retried;
  }

  function getDelivery(deliveryId: string): WebhookDelivery | undefined {
    return deliveries.get(deliveryId);
  }

  function listDeliveries(filter?: {
    subscriptionId?: string;
    event?: string;
    status?: WebhookDelivery["status"];
  }): WebhookDelivery[] {
    let result = Array.from(deliveries.values());
    if (filter?.subscriptionId) {
      result = result.filter((d) => d.subscriptionId === filter.subscriptionId);
    }
    if (filter?.event) {
      result = result.filter((d) => d.event === filter.event);
    }
    if (filter?.status) {
      result = result.filter((d) => d.status === filter.status);
    }
    return result;
  }

  function stats() {
    const all = Array.from(deliveries.values());
    return {
      subscriptions: subscriptions.size,
      pending: all.filter((d) => d.status === "pending").length,
      sent: all.filter((d) => d.status === "sent").length,
      failed: all.filter((d) => d.status === "failed").length,
      dead: all.filter((d) => d.status === "dead").length,
    };
  }

  function destroy(): void {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    retryQueue.length = 0;
    subscriptions.clear();
    deliveries.clear();
  }

  return {
    subscribe,
    unsubscribe,
    getSubscription,
    listSubscriptions,
    send,
    sendEvent,
    retry,
    getDelivery,
    listDeliveries,
    stats,
    sign: signPayload,
    destroy,
  };
}
