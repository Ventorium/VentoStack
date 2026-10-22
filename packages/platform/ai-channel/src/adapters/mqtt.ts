/**
 * MQTT 渠道（IoT 设备对话）
 *
 * topic 约定（prefix 默认 ventostack）：
 *   入站  {prefix}/{channelId}/in
 *   出站  {prefix}/{channelId}/out/{deviceId}
 *
 * payload 支持两种形态：
 *   JSON  {"deviceId":"dev-01","text":"你好"}
 *   纯文本（此时用 MQTT clientId 兜底 deviceId）
 *
 * 安全：只订阅精确 topic 字符串（禁止 # / + 通配）、限制报文大小、
 * 非加密协议必须显式开启 allowInsecure。
 */

import { createTagLogger } from '@ventostack/core';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { buildExternalKey } from '../shared/external-key';
import type {
  ChannelAdapter,
  ChannelRuntimeConfig,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from '../types';

const logger = createTagLogger('ai-channel:mqtt');

/** 每个渠道一条连接；多实例部署时由 runtime 的分布式锁保证只有一个实例建连 */
const clients = new Map<string, MqttClient>();

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function inboundTopic(cfg: ChannelRuntimeConfig): string {
  const prefix = str(cfg.config.topicPrefix, 'ventostack').replace(/^\/+|\/+$/g, '');
  return `${prefix}/${cfg.id}/in`;
}

function outboundTopic(cfg: ChannelRuntimeConfig, deviceId: string): string {
  const prefix = str(cfg.config.topicPrefix, 'ventostack').replace(/^\/+|\/+$/g, '');
  return `${prefix}/${cfg.id}/out/${deviceId}`;
}

/** 解析 payload：JSON 优先，纯文本兜底 */
function parsePayload(
  raw: Buffer,
  cfg: ChannelRuntimeConfig,
  fallbackDeviceId: string,
): { deviceId: string; text: string } | null {
  const maxBytes = num(cfg.config.maxPayloadBytes, 65536);
  if (raw.length > maxBytes) return null;

  const body = raw.toString('utf8').trim();
  if (body === '') return null;

  if (body.startsWith('{')) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const deviceId = str(parsed.deviceId, fallbackDeviceId).trim();
      const text = str(parsed.text, str(parsed.message, '')).trim();
      if (!deviceId || !text) return null;
      return { deviceId: deviceId.slice(0, 128), text: text.slice(0, 8000) };
    } catch {
      // JSON 解析失败按纯文本处理
    }
  }
  const deviceId = fallbackDeviceId.trim();
  if (!deviceId) return null;
  return { deviceId: deviceId.slice(0, 128), text: body.slice(0, 8000) };
}

/** 只允许 mqtt/mqtts/ws/wss；生产要求加密协议 */
function assertBrokerUrl(url: string, allowInsecure: boolean): URL {
  const parsed = new URL(url);
  const protocol = parsed.protocol;
  if (!['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(protocol)) {
    throw new Error('Broker 地址协议不支持（仅 mqtt:// mqtts:// ws:// wss://）');
  }
  if (!allowInsecure && (protocol === 'mqtt:' || protocol === 'ws:')) {
    throw new Error(
      '非加密连接已被拒绝：请使用 mqtts:// 或 wss://，或在渠道配置中开启「允许非加密连接」',
    );
  }
  if (parsed.hostname.includes('#') || parsed.hostname.includes('+')) {
    throw new Error('Broker 地址不能包含通配符');
  }
  return parsed;
}

export const mqttAdapter: ChannelAdapter = {
  type: 'mqtt',

  async start(cfg, sink): Promise<void> {
    const brokerUrl = str(cfg.config.brokerUrl).trim();
    if (!brokerUrl) throw new Error('未配置 Broker 地址');
    const allowInsecure = bool(cfg.config.allowInsecure, false);
    assertBrokerUrl(brokerUrl, allowInsecure);

    const topic = inboundTopic(cfg);
    // topic 由 prefix + channelId 拼成，prefix 已在保存时校验过，这里再兜一次
    if (topic.includes('#') || topic.includes('+')) {
      throw new Error('订阅主题不能包含通配符');
    }

    const clientId = `ventostack-${cfg.id.slice(0, 8)}`;
    const client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      reconnectPeriod: 3_000,
      connectTimeout: 15_000,
      ...(str(cfg.secrets.username) ? { username: cfg.secrets.username } : {}),
      ...(str(cfg.secrets.password) ? { password: cfg.secrets.password } : {}),
    });
    clients.set(cfg.id, client);

    client.on('connect', () => {
      client.subscribe(topic, { qos: 1 }, (error) => {
        if (error) logger.error(`订阅 ${topic} 失败: ${error.message}`);
      });
    });

    client.on('error', (error) => {
      logger.error(`连接错误（${cfg.id}）: ${error.message}`);
    });

    client.on('message', (receivedTopic, payload) => {
      // 只处理精确匹配的订阅主题，避免意外通配
      if (receivedTopic !== topic) return;
      const fallbackDeviceId = client.options.clientId ?? '';
      const parsed = parsePayload(payload, cfg, fallbackDeviceId);
      if (!parsed) return;

      const message: InboundMessage = {
        channelId: cfg.id,
        tenantId: cfg.tenantId,
        // MQTT 没有平台消息 id：用 设备+时间戳+内容长度 生成稳定去重键
        externalMessageId: `mqtt-${parsed.deviceId}-${Date.now()}-${parsed.text.length}`,
        externalKey: buildExternalKey('mqtt', parsed.deviceId),
        externalUserId: parsed.deviceId,
        externalChatId: parsed.deviceId,
        text: parsed.text,
        chatType: 'device',
        replyContext: {},
        receivedAt: Date.now(),
      };
      void sink([message]).catch((error) => {
        logger.error(`入站处理失败: ${error instanceof Error ? error.message : String(error)}`);
      });
    });
  },

  async stop(channelId): Promise<void> {
    const client = clients.get(channelId);
    if (!client) return;
    clients.delete(channelId);
    await client.endAsync();
  },

  async send(msg: OutboundMessage, cfg: ChannelRuntimeConfig): Promise<SendResult> {
    const client = clients.get(cfg.id);
    if (!client || !client.connected) {
      return { ok: false, retryable: true, error: 'MQTT 未连接' };
    }
    const topic = outboundTopic(cfg, msg.target.externalChatId);
    const qos = Number(str(cfg.config.qos, '1'));
    const retain = bool(cfg.config.retain, false);

    return new Promise<SendResult>((resolve) => {
      client.publish(
        topic,
        JSON.stringify({ deviceId: msg.target.externalChatId, text: msg.text, ts: Date.now() }),
        { qos: qos === 2 ? 2 : qos === 0 ? 0 : 1, retain },
        (error) => {
          resolve(
            error
              ? { ok: false, retryable: true, error: error.message }
              : { ok: true, retryable: false },
          );
        },
      );
    });
  },

  async health(cfg: ChannelRuntimeConfig): Promise<{ ok: boolean; detail?: string }> {
    const client = clients.get(cfg.id);
    if (!client) return { ok: false, detail: '未建立连接' };
    return client.connected
      ? { ok: true }
      : { ok: false, detail: `连接已断开（reconnecting=${String(client.reconnecting)}）` };
  },
};
