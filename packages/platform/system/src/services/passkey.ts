/**
 * @ventostack/system - PasskeyService
 * 通行密钥管理：注册、认证、列表、删除
 * 基于 WebAuthn (FIDO2) 协议，使用 @simplewebauthn/server 实现服务端验证
 */

import type { SqlExecutor } from "@ventostack/database";
import type { Cache } from "@ventostack/cache";
import type { AuditStore } from "@ventostack/observability";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";

/** 通行密钥列表项（不含敏感数据） */
export interface PasskeyListItem {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

/** 通行密钥完整记录（内部使用） */
interface PasskeyRecord {
  id: string;
  userId: string;
  name: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  deviceType: string | null;
  backedUp: boolean;
  aaguid: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

/** 通行密钥服务接口 */
export interface PasskeyService {
  beginRegistration(userId: string): Promise<{
    options: PublicKeyCredentialCreationOptionsJSON;
    challengeId: string;
  }>;
  finishRegistration(userId: string, name: string, challengeId: string, credential: RegistrationResponseJSON): Promise<PasskeyListItem>;
  beginAuthentication(username: string): Promise<{
    options: PublicKeyCredentialRequestOptionsJSON;
    challengeId: string;
  }>;
  finishAuthentication(challengeId: string, assertion: AuthenticationResponseJSON): Promise<{
    userId: string;
    username: string;
  }>;
  listPasskeys(userId: string): Promise<PasskeyListItem[]>;
  removePasskey(userId: string, passkeyId: string): Promise<void>;
}

const MAX_PASSKEYS = 3;
const CHALLENGE_TTL = 120;

/**
 * 创建通行密钥服务实例
 */
export function createPasskeyService(deps: {
  executor: SqlExecutor;
  cache: Cache;
  rpID: string;
  rpName: string;
  rpOrigins: string[];
  auditStore: AuditStore;
}): PasskeyService {
  const { executor, cache, rpID, rpName, rpOrigins, auditStore } = deps;

  return {
    async beginRegistration(userId) {
      // 检查数量限制
      const countRows = await executor(
        "SELECT COUNT(*) AS cnt FROM sys_passkey WHERE user_id = $1",
        [userId],
      );
      const count = Number((countRows as Array<Record<string, unknown>>)[0]?.cnt ?? 0);
      if (count >= MAX_PASSKEYS) {
        throw new Error(`最多只能注册 ${MAX_PASSKEYS} 个通行密钥`);
      }

      // 查询已有凭证用于排除重复注册
      const existingRows = await executor(
        "SELECT credential_id FROM sys_passkey WHERE user_id = $1",
        [userId],
      );
      const excludeCredentials = (existingRows as Array<{ credential_id: string }>).map(r => ({
        id: r.credential_id,
        type: "public-key" as const,
      }));

      const options = await generateRegistrationOptions({
        rpID,
        rpName,
        userName: userId,
        excludeCredentials,
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      });

      // 存储 challenge（字符串，不需要 JSON.stringify）
      const challengeId = crypto.randomUUID();
      await cache.set(`passkey_reg:${challengeId}`, options.challenge, { ttl: CHALLENGE_TTL });

      return { options, challengeId };
    },

    async finishRegistration(userId, name, challengeId, credential) {
      // 取回 challenge
      const challengeStr = await cache.get<string>(`passkey_reg:${challengeId}`);
      if (!challengeStr) {
        throw new Error("注册请求已过期，请重新开始");
      }
      await cache.del(`passkey_reg:${challengeId}`);

      // 验证
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challengeStr,
        expectedOrigin: rpOrigins,
        expectedRPID: rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new Error("通行密钥验证失败");
      }

      const info = verification.registrationInfo;
      const id = crypto.randomUUID();

      // Convert Uint8Array publicKey to base64 for storage
      const publicKeyBase64 = Buffer.from(info.credential.publicKey).toString("base64");

      await executor(
        `INSERT INTO sys_passkey (id, user_id, name, credential_id, public_key, counter, transports, device_type, backed_up, aaguid, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          id,
          userId,
          name,
          info.credential.id,
          publicKeyBase64,
          info.credential.counter,
          JSON.stringify(info.credential.transports ?? []),
          info.credentialDeviceType,
          info.credentialBackedUp ? true : false,
          info.aaguid,
        ],
      );

      await auditStore.append({
        actor: userId,
        action: "passkey.registered",
        resource: "auth",
        resourceId: id,
        result: "success",
        metadata: { name },
      });

      return {
        id,
        name,
        deviceType: info.credentialDeviceType ?? null,
        backedUp: info.credentialBackedUp ?? false,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
    },

    async beginAuthentication(username) {
      // 查找用户
      const userRows = await executor(
        "SELECT id FROM sys_user WHERE username = $1 AND deleted_at IS NULL AND status = 1",
        [username],
      );
      const users = userRows as Array<{ id: string }>;
      if (users.length === 0) {
        throw new Error("通行密钥登录失败");
      }

      const userId = users[0]!.id;

      // 查找用户的 passkeys
      const passkeyRows = await executor(
        "SELECT credential_id, transports FROM sys_passkey WHERE user_id = $1",
        [userId],
      );
      const passkeys = passkeyRows as Array<{ credential_id: string; transports: string | null }>;
      if (passkeys.length === 0) {
        throw new Error("通行密钥登录失败");
      }

      const allowCredentials = passkeys.map(pk => ({
        id: pk.credential_id,
        type: "public-key" as const,
        transports: pk.transports ? JSON.parse(pk.transports) : undefined,
      }));

      const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials,
        userVerification: "preferred",
      });

      // 存储 challenge + userId 映射
      const challengeId = crypto.randomUUID();
      await cache.set(`passkey_auth:${challengeId}`, JSON.stringify({
        challenge: options.challenge,
        userId,
        username,
      }), { ttl: CHALLENGE_TTL });

      return { options, challengeId };
    },

    async finishAuthentication(challengeId, assertion) {
      // 取回 challenge 数据
      const dataStr = await cache.get<string>(`passkey_auth:${challengeId}`);
      if (!dataStr) {
        throw new Error("认证请求已过期，请重新开始");
      }
      await cache.del(`passkey_auth:${challengeId}`);

      const { challenge, userId, username } = JSON.parse(dataStr) as {
        challenge: string;
        userId: string;
        username: string;
      };

      // 查找 passkey
      const rows = await executor(
        "SELECT id, credential_id, public_key, counter FROM sys_passkey WHERE user_id = $1 AND credential_id = $2",
        [userId, assertion.id],
      );
      const passkeys = rows as Array<{ id: string; credential_id: string; public_key: string; counter: number }>;
      if (passkeys.length === 0) {
        throw new Error("通行密钥未找到");
      }

      const passkey = passkeys[0]!;

      // Decode base64 publicKey back to Uint8Array
      const publicKeyBytes = new Uint8Array(Buffer.from(passkey.public_key, "base64"));

      // 验证
      const verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge,
        expectedOrigin: rpOrigins,
        expectedRPID: rpID,
        credential: {
          id: passkey.credential_id,
          publicKey: publicKeyBytes,
          counter: passkey.counter,
        },
      });

      if (!verification.verified) {
        await auditStore.append({
          actor: userId,
          action: "passkey.auth_failed",
          resource: "auth",
          result: "failure",
        });
        throw new Error("通行密钥验证失败");
      }

      // 更新 counter 和最后使用时间
      const newCounter = verification.authenticationInfo.newCounter;
      await executor(
        "UPDATE sys_passkey SET counter = $1, last_used_at = NOW() WHERE id = $2",
        [newCounter, passkey.id],
      );

      await auditStore.append({
        actor: userId,
        action: "passkey.auth_success",
        resource: "auth",
        resourceId: passkey.id,
        result: "success",
      });

      return { userId, username };
    },

    async listPasskeys(userId) {
      const rows = await executor(
        `SELECT id, name, device_type, backed_up, created_at, last_used_at
         FROM sys_passkey WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId],
      );

      return (rows as Array<Record<string, unknown>>).map(r => ({
        id: r.id as string,
        name: r.name as string,
        deviceType: (r.device_type as string) ?? null,
        backedUp: r.backed_up as boolean,
        createdAt: r.created_at as string,
        lastUsedAt: (r.last_used_at as string) ?? null,
      }));
    },

    async removePasskey(userId, passkeyId) {
      const rows = await executor(
        "SELECT id FROM sys_passkey WHERE id = $1 AND user_id = $2",
        [passkeyId, userId],
      );
      if ((rows as unknown[]).length === 0) {
        throw new Error("通行密钥不存在或不属于当前用户");
      }

      await executor("DELETE FROM sys_passkey WHERE id = $1", [passkeyId]);

      await auditStore.append({
        actor: userId,
        action: "passkey.removed",
        resource: "auth",
        resourceId: passkeyId,
        result: "success",
      });
    },
  };
}
