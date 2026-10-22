/**
 * 外部会话稳定标识（externalKey）
 *
 * 它不是「消息 id」，而是「这段对话是谁的」。同一个 key 恒定映射同一个 AI 会话，
 * 这是「渠道不是第二套会话体系，而是同一 session 的另一个 I/O 入口」的前提。
 *
 * 不做群聊，因此只有两种形态：
 *   dm:{externalUserId}     私聊（微信 / QQ / 飞书 / 企微 / 钉钉）
 *   mqtt:{deviceId}         IoT 设备（恒为 per-device）
 */

export function dmKey(externalUserId: string): string {
  return `dm:${externalUserId}`;
}

export function mqttKey(deviceId: string): string {
  return `mqtt:${deviceId}`;
}

/** 按渠道类型构造 key（MQTT 用设备维度，其余用用户维度） */
export function buildExternalKey(channelType: string, externalUserId: string): string {
  return channelType === 'mqtt' ? mqttKey(externalUserId) : dmKey(externalUserId);
}

/** 从 key 中取回外部 id（失败返回 null，调用方按「无法解析」处理） */
export function parseExternalKey(key: string): { kind: 'dm' | 'mqtt'; id: string } | null {
  if (key.startsWith('dm:')) return { kind: 'dm', id: key.slice(3) };
  if (key.startsWith('mqtt:')) return { kind: 'mqtt', id: key.slice(5) };
  return null;
}

/** key 长度上限（DB 列 255）：超长直接拒绝，避免写入失败 */
export const MAX_EXTERNAL_KEY_LENGTH = 255;

export function isValidExternalKey(key: string): boolean {
  return key.length > 3 && key.length <= MAX_EXTERNAL_KEY_LENGTH;
}
