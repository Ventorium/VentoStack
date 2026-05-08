/**
 * @ventostack/system - PasskeyService
 * 通行密钥管理：注册、认证、列表、删除
 * 基于 WebAuthn (FIDO2) 协议，使用 @simplewebauthn/server 实现服务端验证
 */

import type { Database } from "@ventostack/database";
import type { Cache } from "@ventostack/cache";
import type { AuditStore } from "@ventostack/observability";
import { PasskeyModel } from "../models/passkey";
import { UserModel } from "../models/user";
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
  db: Database;
  cache: Cache;
  rpID: string;
  rpName: string;
  rpOrigins: string[];
  auditStore: AuditStore;
}): PasskeyService {
  const { db, cache, rpID, rpName, rpOrigins, auditStore } = deps;

  return {
    async beginRegistration(userId) {
      // 检查数量限制
      const count = await db.query(PasskeyModel)
        .where("user_id", "=", userId)
        .count();
      if (count >= MAX_PASSKEYS) {
        throw new Error(`最多只能注册 ${MAX_PASSKEYS} 个通行密钥`);
      }

      // 查询已有凭证用于排除重复注册
      const existingRows = await db.query(PasskeyModel)
        .where("user_id", "=", userId)
        .select("credential_id")
        .list();
      const excludeCredentials = existingRows.map(r => ({
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

      await db.query(PasskeyModel).insert({
        id,
        user_id: userId,
        name,
        credential_id: info.credential.id,
        public_key: publicKeyBase64,
        counter: BigInt(info.credential.counter),
        transports: JSON.stringify(info.credential.transports ?? []),
        device_type: info.credentialDeviceType,
        backed_up: info.credentialBackedUp ? true : false,
        aaguid: info.aaguid,
        created_at: new Date(),
      });

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
      const authUser = await db.query(UserModel)
        .where("username", "=", username)
        .where("status", "=", 1)
        .select("id")
        .get();
      if (!authUser) {
        throw new Error("通行密钥登录失败");
      }

      const userId = authUser.id;

      // 查找用户的 passkeys
      const passkeyRows = await db.query(PasskeyModel)
        .where("user_id", "=", userId)
        .select("credential_id", "transports")
        .list();
      if (passkeyRows.length === 0) {
        throw new Error("通行密钥登录失败");
      }

      const allowCredentials = passkeyRows.map(pk => ({
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
      const passkey = await db.query(PasskeyModel)
        .where("user_id", "=", userId)
        .where("credential_id", "=", assertion.id)
        .select("id", "credential_id", "public_key", "counter")
        .get();
      if (!passkey) {
        throw new Error("通行密钥未找到");
      }

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
          counter: Number(passkey.counter),
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
      await db.query(PasskeyModel).where("id", "=", passkey.id).update({
        counter: BigInt(newCounter),
        last_used_at: new Date(),
      });

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
      const rows = await db.query(PasskeyModel)
        .where("user_id", "=", userId)
        .select("id", "name", "device_type", "backed_up", "created_at", "last_used_at")
        .orderBy("created_at", "desc")
        .list();

      return rows.map(r => ({
        id: r.id,
        name: r.name,
        deviceType: r.device_type ?? null,
        backedUp: r.backed_up,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
        lastUsedAt: r.last_used_at instanceof Date ? r.last_used_at.toISOString() : r.last_used_at ?? null,
      }));
    },

    async removePasskey(userId, passkeyId) {
      const existing = await db.query(PasskeyModel)
        .where("id", "=", passkeyId)
        .where("user_id", "=", userId)
        .select("id")
        .get();
      if (!existing) {
        throw new Error("通行密钥不存在或不属于当前用户");
      }

      await db.query(PasskeyModel).where("id", "=", passkeyId).hardDelete();

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
