/**
 * 身份绑定
 *
 * 未绑定用户的消息 fail-closed：不进 Agent、不耗 token，只回绑定引导。
 * 这是渠道的安全底线——否则任何人找到你的机器人就能烧你的额度。
 *
 * 绑定码：6 位数字 / TTL 5 分钟 / 一次性 / 同用户 5 次每小时。
 */

import type { Database } from '@ventostack/database';
import { createIdentityDao } from '../models/identity';
import type { IdentityDao } from '../models/identity';
import { ChannelError, type IdentityRow } from '../types';

/** 绑定码有效期：5 分钟（够用户切到 IM 里发送，又不至于长期有效） */
export const BIND_CODE_TTL_MS = 5 * 60 * 1000;
/** 同用户每小时最多申请 5 次，防刷 */
const BIND_CODE_QUOTA = 5;
const BIND_CODE_WINDOW_MS = 60 * 60 * 1000;

export interface BindCodeInfo {
  code: string;
  expiresAt: string;
}

export interface BindResult {
  ok: boolean;
  reason?: string;
}

export interface OutboundTarget {
  externalUserId: string;
  externalChatId: string;
  identityId: string;
}

export interface IdentityService {
  findByExternal(channelId: string, externalUserId: string): Promise<IdentityRow | null>;
  issueBindCode(
    channelId: string,
    scope: { tenantId: string; userId: string },
  ): Promise<BindCodeInfo>;
  /** 渠道内 /绑定 <code> 调用：校验归属 + 未过期 + 一次性 */
  redeemBindCode(params: {
    code: string;
    channelId: string;
    externalUserId: string;
    externalChatId: string;
    displayName?: string;
  }): Promise<BindResult>;
  listByChannel(
    channelId: string,
    scope: { tenantId: string; userId: string },
  ): Promise<IdentityRow[]>;
  listByUser(scope: { tenantId: string; userId: string }): Promise<IdentityRow[]>;
  unbind(identityId: string, scope: { tenantId: string; userId: string }): Promise<boolean>;
  /** 出站目标解析：当前用户在该渠道绑定的第一个账号 */
  resolveTarget(
    channelId: string,
    tenantId: string,
    userId: string,
  ): Promise<OutboundTarget | null>;
  /** 更新私聊会话 id（部分平台首次发送后才能拿到） */
  updateChatId(identityId: string, externalChatId: string): Promise<void>;
}

/** 6 位数字码：去掉易混淆无意义前缀，纯随机 */
function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const value = (buf[0] ?? 0) % 1_000_000;
  return value.toString().padStart(6, '0');
}

export function createIdentityService(deps: { db: Database }): IdentityService {
  const dao: IdentityDao = createIdentityDao({ db: deps.db });

  return {
    async findByExternal(channelId: string, externalUserId: string): Promise<IdentityRow | null> {
      return dao.findByExternal(channelId, externalUserId);
    },

    async issueBindCode(channelId, scope): Promise<BindCodeInfo> {
      const recent = await dao.countRecentBindCodes(
        scope.tenantId,
        scope.userId,
        BIND_CODE_WINDOW_MS,
      );
      if (recent >= BIND_CODE_QUOTA) {
        throw new ChannelError('绑定码申请过于频繁，请稍后再试', 'rate_limited', 429);
      }
      const expiresAt = new Date(Date.now() + BIND_CODE_TTL_MS);
      // 极小概率撞码：重试三次，仍冲突就报错（比静默失败好）
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const code = generateCode();
        try {
          await dao.createBindCode({
            code,
            channelId,
            tenantId: scope.tenantId,
            userId: scope.userId,
            expiresAt,
          });
          return { code, expiresAt: expiresAt.toISOString() };
        } catch (error) {
          if (attempt === 2) throw error;
        }
      }
      throw new ChannelError('生成绑定码失败，请重试', 'bind_code_failed', 500);
    },

    async redeemBindCode(params): Promise<BindResult> {
      const row = await dao.getBindCode(params.code);
      if (!row) return { ok: false, reason: '验证码不存在、已使用或已过期' };
      if (row.channel_id !== params.channelId) {
        return { ok: false, reason: '这个验证码不属于当前渠道' };
      }
      // 条件更新保证一次性：并发下只有一个人消费成功
      const consumed = await dao.consumeBindCode(params.code);
      if (!consumed) return { ok: false, reason: '验证码已被使用，请重新生成' };

      await dao.upsert({
        channelId: params.channelId,
        tenantId: row.tenant_id,
        userId: row.user_id,
        externalUserId: params.externalUserId,
        externalChatId: params.externalChatId,
        displayName: params.displayName ?? null,
      });
      return { ok: true };
    },

    async listByChannel(channelId, scope): Promise<IdentityRow[]> {
      return dao.listByChannel(channelId, scope.tenantId, scope.userId);
    },

    async listByUser(scope): Promise<IdentityRow[]> {
      return dao.listByUser(scope.tenantId, scope.userId);
    },

    async unbind(identityId, scope): Promise<boolean> {
      return dao.remove(identityId, scope.tenantId, scope.userId);
    },

    async resolveTarget(
      channelId: string,
      tenantId: string,
      userId: string,
    ): Promise<OutboundTarget | null> {
      const rows = await dao.listByChannel(channelId, tenantId, userId);
      const first = rows[0];
      if (!first) return null;
      return {
        identityId: first.id,
        externalUserId: first.external_user_id,
        externalChatId: first.external_chat_id ?? first.external_user_id,
      };
    },

    async updateChatId(identityId: string, externalChatId: string): Promise<void> {
      await dao.updateChatId(identityId, externalChatId);
    },
  };
}
