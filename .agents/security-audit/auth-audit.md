# Auth Layer Security Audit
## 1. JWT Implementation
```typescript
/**
 * @ventostack/auth - JWT 签发与验证
 * 基于 Web Crypto API，仅允许 HMAC 算法（HS256/HS384/HS512）
 */

import { UnauthorizedError } from "@ventostack/core";

/** 支持的 JWT 签名算法 */
export type JWTAlgorithm = "HS256" | "HS384" | "HS512";

/** 算法白名单，禁止非白名单算法 */
const ALGORITHM_WHITELIST: ReadonlySet<string> = new Set(["HS256", "HS384", "HS512"]);

/** JWT 算法到 Web Crypto 哈希算法的映射 */
const ALGORITHM_MAP: Record<JWTAlgorithm, string> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

/** 密钥最小字节数（256-bit） */
const MIN_SECRET_BYTES = 32;

/** JWT Payload 标准字段与自定义扩展 */
export interface JWTPayload {
  /** 主题（用户标识） */
  sub?: string;
  /** 签发者 */
  iss?: string;
  /** 受众 */
  aud?: string;
  /** 过期时间（Unix 时间戳，秒） */
  exp?: number;
  /** 生效时间（Unix 时间戳，秒） */
  nbf?: number;
  /** 签发时间（Unix 时间戳，秒） */
  iat?: number;
  /** JWT ID（唯一标识） */
  jti?: string;
  /** 自定义扩展字段 */
  [key: string]: unknown;
}

/** JWT 签名与验证选项 */
export interface JWTOptions {
  /** 签名算法，默认 HS256 */
  algorithm?: JWTAlgorithm;
  /** 签发者 */
  issuer?: string;
  /** 受众 */
  audience?: string;
  /** 过期时长（秒） */
  expiresIn?: number;
}

/** JWT 管理器配置 */
export interface JWTConfig {
  /** 默认密钥 */
  secret?: string;
  /** 默认选项 */
  defaultOptions?: JWTOptions;
}

/** JWT 管理器接口 */
export interface JWTManager {
  /**
   * 签发 JWT
   * @param payload JWT 载荷数据
   * @param secret 密钥（可选，默认使用配置中的密钥）
   * @param options 签名选项（可选，默认使用配置中的选项）
   * @returns 签发的 JWT 字符串
   */
  sign(payload: JWTPayload, secret?: string, options?: JWTOptions): Promise<string>;

  /**
   * 验证 JWT
   * @param token JWT 字符串
   * @param secret 密钥（可选）
   * @param options 验证选项（可选）
   * @returns 验证通过后的 Payload
   * @throws UnauthorizedError 验证失败时抛出
   */
  verify(token: string, secret?: string, options?: JWTOptions): Promise<JWTPayload>;

  /**
   * 解码 JWT（不验证签名）
   * @param token JWT 字符串
   * @returns Payload 对象，格式错误返回 null
   */
  decode(token: string): JWTPayload | null;
}

/**
 * Base64URL 编码 Uint8Array
 * @param data 字节数组
 * @returns Base64URL 字符串
 */
function base64urlEncode(data: Uint8Array): string {
  const binary = String.fromCharCode(...data);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64URL 编码字符串
 * @param str 原始字符串
 * @returns Base64URL 字符串
 */
function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

/**
 * Base64URL 解码为 Uint8Array
 * @param str Base64URL 字符串
 * @returns 字节数组
 */
function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const base64 = pad ? padded + "=".repeat(4 - pad) : padded;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Base64URL 解码为字符串
 * @param str Base64URL 字符串
 * @returns 解码后的字符串
 */
function base64urlDecodeString(str: string): string {
  return new TextDecoder().decode(base64urlDecode(str));
}

/**
 * 校验密钥长度是否满足安全要求
 * @param secret 密钥字符串
 * @throws 密钥长度不足时抛出 Error
 */
function validateSecret(secret: string): void {
  const bytes = new TextEncoder().encode(secret);
  if (bytes.length < MIN_SECRET_BYTES) {
    throw new Error(
      `Secret must be at least ${MIN_SECRET_BYTES} bytes (256-bit), got ${bytes.length} bytes`,
    );
  }
}

/**
 * 导入 HMAC 密钥到 Web Crypto
 * @param secret 密钥字符串
 * @param algorithm JWT 算法
 * @returns CryptoKey 对象
 */
async function importKey(secret: string, algorithm: JWTAlgorithm): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: ALGORITHM_MAP[algorithm] },
    false,
    ["sign", "verify"],
  );
}

/**
 * 创建 JWT 管理器实例
 * @param config JWT 配置（可选）
 * @returns JWT 管理器实例
 */
export function createJWT(config?: JWTConfig): JWTManager {
  const defaultSecret = config?.secret;
  const defaultOptions = config?.defaultOptions;

  /**
   * 解析最终使用的密钥
   * @param secret 调用时传入的密钥（优先）
   * @returns 解析后的密钥
   * @throws 未提供密钥时抛出 Error
   */
  function resolveSecret(secret?: string): string {
    const s = secret ?? defaultSecret;
    if (!s) {
      throw new Error(
        "JWT secret is required. Provide it via createJWT({ secret }) or sign()/verify().",
      );
    }
    return s;
  }

  /**
   * 合并默认选项与调用选项
   * @param options 调用时传入的选项
   * @returns 合并后的选项
   */
  function mergeOptions(options?: JWTOptions): JWTOptions {
    return {
      ...defaultOptions,
      ...options,
    };
  }

  return {
    async sign(payload: JWTPayload, secret?: string, options?: JWTOptions): Promise<string> {
      const resolvedSecret = resolveSecret(secret);
      const merged = mergeOptions(options);
      validateSecret(resolvedSecret);

      const algorithm = merged.algorithm ?? "HS256";
      if (!ALGORITHM_WHITELIST.has(algorithm)) {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      }

      const now = Math.floor(Date.now() / 1000);
      const finalPayload: JWTPayload = {
        ...payload,
        iat: now,
      };

      if (merged.issuer) {
        finalPayload.iss = merged.issuer;
      }
      if (merged.audience) {
        finalPayload.aud = merged.audience;
      }
      if (merged.expiresIn != null) {
        finalPayload.exp = now + merged.expiresIn;
      }

      const header = base64urlEncodeString(JSON.stringify({ alg: algorithm, typ: "JWT" }));
      const body = base64urlEncodeString(JSON.stringify(finalPayload));
      const signingInput = `${header}.${body}`;

      const key = await importKey(resolvedSecret, algorithm);
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(signingInput),
      );

      const sig = base64urlEncode(new Uint8Array(signature));
      return `${signingInput}.${sig}`;
    },

    async verify(token: string, secret?: string, options?: JWTOptions): Promise<JWTPayload> {
      const resolvedSecret = resolveSecret(secret);
      const merged = mergeOptions(options);
      validateSecret(resolvedSecret);

      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new UnauthorizedError("Invalid token format");
      }

      const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

      // Decode and validate header
      let header: { alg?: string; typ?: string };
      try {
        header = JSON.parse(base64urlDecodeString(headerPart));
      } catch {
        throw new UnauthorizedError("无效的令牌头");
      }

      if (!header.alg || !ALGORITHM_WHITELIST.has(header.alg)) {
        throw new UnauthorizedError(`不支持的算法：${header.alg ?? "none"}`);
      }

      // Validate typ header: if present, must be "JWT"
      if (header.typ !== undefined && header.typ !== "JWT") {
        throw new UnauthorizedError("无效的令牌类型");
      }

      const algorithm = header.alg as JWTAlgorithm;
      const expectedAlgorithm = merged.algorithm ?? algorithm;
      if (algorithm !== expectedAlgorithm) {
        throw new UnauthorizedError(`算法不匹配：期望 ${expectedAlgorithm}，实际 ${algorithm}`);
      }

      // Verify signature using crypto.subtle.verify (constant-time)
      const key = await importKey(resolvedSecret, algorithm);
      const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
      const signature = base64urlDecode(signaturePart);

      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        signature as unknown as Uint8Array<ArrayBuffer>,
        signingInput,
      );
      if (!valid) {
        throw new UnauthorizedError("Invalid signature");
      }

      // Decode payload
      let payload: JWTPayload;
      try {
        payload = JSON.parse(base64urlDecodeString(payloadPart));
      } catch {
        throw new UnauthorizedError("Invalid token payload");
      }

      const now = Math.floor(Date.now() / 1000);

      // Check exp
      if (payload.exp != null && payload.exp <= now) {
        throw new UnauthorizedError("Token expired");
      }

      // Check nbf
      if (payload.nbf != null && payload.nbf > now) {
        throw new UnauthorizedError("Token not yet valid");
      }

      // Check issuer
      if (merged.issuer && payload.iss !== merged.issuer) {
        throw new UnauthorizedError(
          `Issuer mismatch: expected ${merged.issuer}, got ${payload.iss}`,
        );
      }

      // Check audience
      if (merged.audience && payload.aud !== merged.audience) {
        throw new UnauthorizedError(
          `Audience mismatch: expected ${merged.audience}, got ${payload.aud}`,
        );
      }

      return payload;
    },

    decode(token: string): JWTPayload | null {
      try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        return JSON.parse(base64urlDecodeString(parts[1]!));
      } catch {
        return null;
      }
    },
  };
}
```
## 2. RBAC Implementation
```typescript
/**
 * @ventostack/auth - 基于角色的访问控制（RBAC）
 * 默认 deny，必须显式授权；基于内存 Map 存储角色与权限关系
 */

/**
 * 权限定义
 * 描述对某个资源的某种操作权限
 */
export interface Permission {
  /** 资源标识（如 "user", "order", "post"） */
  resource: string;
  /** 操作类型（如 "read", "write", "delete"） */
  action: string;
}

/**
 * 角色定义
 * 一组权限的集合，用于批量授权
 */
export interface Role {
  /** 角色名称 */
  name: string;
  /** 角色拥有的权限列表 */
  permissions: Permission[];
}

/**
 * RBAC 管理器接口
 * 提供角色的增删改查与权限判定能力
 */
export interface RBAC {
  /**
   * 添加角色
   * @param role 角色定义
   */
  addRole(role: Role): void;

  /**
   * 移除角色
   * @param name 角色名称
   */
  removeRole(name: string): void;

  /**
   * 获取角色定义
   * @param name 角色名称
   * @returns 角色定义，不存在时返回 undefined
   */
  getRole(name: string): Role | undefined;

  /**
   * 判断指定角色是否拥有某权限
   * @param roleName 角色名称
   * @param resource 资源标识
   * @param action 操作类型
   * @returns 拥有权限返回 true，否则返回 false
   */
  hasPermission(roleName: string, resource: string, action: string): boolean;

  /**
   * 判断一组角色中是否有任一角色拥有某权限
   * @param roles 角色名称列表
   * @param resource 资源标识
   * @param action 操作类型
   * @returns 拥有权限返回 true，否则返回 false
   */
  can(roles: string[], resource: string, action: string): boolean;

  /**
   * 列出所有已注册的角色
   * @returns 角色列表
   */
  listRoles(): Role[];
}

/**
 * 创建 RBAC 管理器实例
 * 基于内存 Map 存储角色与权限关系
 * @returns RBAC 管理器实例
 */
export function createRBAC(): RBAC {
  const roles = new Map<string, Role>();

  return {
    addRole(role: Role): void {
      roles.set(role.name, {
        name: role.name,
        permissions: [...role.permissions],
      });
    },

    removeRole(name: string): void {
      roles.delete(name);
    },

    getRole(name: string): Role | undefined {
      const role = roles.get(name);
      if (!role) return undefined;
      return { name: role.name, permissions: [...role.permissions] };
    },

    hasPermission(roleName: string, resource: string, action: string): boolean {
      const role = roles.get(roleName);
      if (!role) return false;
      return role.permissions.some((p) => p.resource === resource && p.action === action);
    },

    can(roleNames: string[], resource: string, action: string): boolean {
      return roleNames.some((roleName) => {
        const role = roles.get(roleName);
        if (!role) return false;
        return role.permissions.some((p) => p.resource === resource && p.action === action);
      });
    },

    listRoles(): Role[] {
      return Array.from(roles.values()).map((r) => ({
        name: r.name,
        permissions: [...r.permissions],
      }));
    },
  };
}
```
## 3. Session Management
```typescript
/**
 * @ventostack/auth - Session 管理
 * 提供基于 SessionStore 抽象的 Session 创建、查询、更新、销毁与续期能力
 * 内置内存存储实现，支持 TTL 过期检查与键前缀隔离
 */

/**
 * Session 数据结构
 */
export interface Session {
  /** Session 唯一标识 */
  id: string;
  /** Session 关联的用户数据 */
  data: Record<string, unknown>;
  /** Session 过期时间戳（毫秒） */
  expiresAt: number;
}

/**
 * Session 管理器配置选项
 */
export interface SessionOptions {
  /** Session 默认 TTL（秒），默认 3600 */
  ttl?: number;
  /** 存储键前缀，默认 "session:" */
  prefix?: string;
  /** Cookie 名称，默认 "sid" */
  cookieName?: string;
}

/**
 * Session 存储接口
 * 定义底层存储（如 Redis、内存、数据库）必须实现的操作契约
 */
export interface SessionStore {
  /**
   * 根据 Session ID 获取 Session
   * @param id Session ID
   * @returns Session 对象，不存在或已过期返回 null
   */
  get(id: string): Promise<Session | null>;

  /**
   * 保存 Session
   * @param session Session 对象
   */
  set(session: Session): Promise<void>;

  /**
   * 删除 Session
   * @param id Session ID
   */
  delete(id: string): Promise<void>;

  /**
   * 延长 Session 过期时间（续期）
   * @param id Session ID
   * @param ttl 续期时长（秒）
   */
  touch(id: string, ttl: number): Promise<void>;

  /**
   * 删除指定用户的所有 Session
   * @param userId 用户 ID
   * @returns 删除的 Session 数量
   */
  deleteByUser?(userId: string): Promise<number>;
}

/**
 * Session 管理器接口
 * 提供 Session 的创建、查询、更新、销毁与续期能力
 */
export interface SessionManager {
  /**
   * 创建新 Session
   * @param data 可选的初始用户数据
   * @returns 新创建的 Session 对象
   */
  create(data?: Record<string, unknown>): Promise<Session>;

  /**
   * 根据 Session ID 获取 Session
   * @param id Session ID
   * @returns Session 对象，不存在或已过期返回 null
   */
  get(id: string): Promise<Session | null>;

  /**
   * 更新 Session 数据（合并更新）
   * @param id Session ID
   * @param data 要合并的数据
   */
  update(id: string, data: Record<string, unknown>): Promise<void>;

  /**
   * 销毁 Session
   * @param id Session ID
   */
  destroy(id: string): Promise<void>;

  /**
   * 续期 Session 过期时间
   * @param id Session ID
   */
  touch(id: string): Promise<void>;

  /**
   * 销毁指定用户的所有 Session
   * @param userId 用户 ID
   * @returns 销毁的 Session 数量
   */
  destroyByUser(userId: string): Promise<number>;
}

/** 默认 Session TTL（秒） */
const DEFAULT_TTL = 3600;
/** 默认存储键前缀 */
const DEFAULT_PREFIX = "session:";
/** 默认 Cookie 名称 */
const DEFAULT_COOKIE_NAME = "sid";

/**
 * 创建内存 Session 存储实例
 * 基于 Map 实现，支持 TTL 过期检查
 * @returns 内存 Session 存储实例
 */
export function createMemorySessionStore(): SessionStore {
  const sessions = new Map<string, Session>();

  return {
    async get(id: string): Promise<Session | null> {
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expiresAt <= Date.now()) {
        sessions.delete(id);
        return null;
      }
      return { ...session, data: { ...session.data } };
    },

    async set(session: Session): Promise<void> {
      sessions.set(session.id, {
        ...session,
        data: { ...session.data },
      });
    },

    async delete(id: string): Promise<void> {
      sessions.delete(id);
    },

    async touch(id: string, ttl: number): Promise<void> {
      const session = sessions.get(id);
      if (session) {
        if (session.expiresAt <= Date.now()) {
          sessions.delete(id);
          return;
        }
        session.expiresAt = Date.now() + ttl * 1000;
      }
    },
  };
}

/**
 * 创建 Session 管理器实例
 * @param store Session 存储实例
 * @param options Session 配置选项
 * @returns Session 管理器实例
 */
export function createSessionManager(
  store: SessionStore,
  options: SessionOptions = {},
): SessionManager {
  const ttl = options.ttl ?? DEFAULT_TTL;
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const _cookieName = options.cookieName ?? DEFAULT_COOKIE_NAME;

  // userId -> Set<sessionId> index for destroyByUser support
  const userSessions = new Map<string, Set<string>>();

  /**
   * 为 Session ID 添加前缀
   * @param id 原始 Session ID
   * @returns 带前缀的存储键
   */
  function prefixedId(id: string): string {
    return `${prefix}${id}`;
  }

  return {
    async create(data: Record<string, unknown> = {}): Promise<Session> {
      const id = crypto.randomUUID();
      const session: Session = {
        id,
        data,
        expiresAt: Date.now() + ttl * 1000,
      };
      await store.set({ ...session, id: prefixedId(id), data: { ...data } });

      // Track userId -> sessionId index
      const userId = data.userId as string | undefined;
      if (userId) {
        let sessions = userSessions.get(userId);
        if (!sessions) {
          sessions = new Set();
          userSessions.set(userId, sessions);
        }
        sessions.add(id);
      }

      return session;
    },

    async get(id: string): Promise<Session | null> {
      const session = await store.get(prefixedId(id));
      if (!session) return null;
      return { ...session, id };
    },

    async update(id: string, data: Record<string, unknown>): Promise<void> {
      const session = await store.get(prefixedId(id));
      if (!session) return;
      session.data = { ...session.data, ...data };
      await store.set({ ...session, id: prefixedId(id) });
    },

    async destroy(id: string): Promise<void> {
      await store.delete(prefixedId(id));

      // Remove from userSessions index
      for (const [, sessionIds] of userSessions) {
        if (sessionIds.has(id)) {
          sessionIds.delete(id);
          break;
        }
      }
    },

    async touch(id: string): Promise<void> {
      await store.touch(prefixedId(id), ttl);
    },

    async destroyByUser(userId: string): Promise<number> {
      // If store supports deleteByUser natively, delegate to it
      if (store.deleteByUser) {
        return store.deleteByUser(userId);
      }

      const sessionIds = userSessions.get(userId);
      if (!sessionIds || sessionIds.size === 0) {
        return 0;
      }

      let count = 0;
      for (const sessionId of sessionIds) {
        await store.delete(prefixedId(sessionId));
        count++;
      }
      userSessions.delete(userId);
      return count;
    },
  };
}
```
## 4. TOTP / MFA
```typescript
/**
 * @ventostack/auth - TOTP 双因素认证 (RFC 6238)
 * 基于 Web Crypto API HMAC 实现，支持密钥生成、URI 生成、验证码生成与校验
 * 兼容 Google Authenticator 等标准 TOTP 客户端
 */

/**
 * TOTP 管理器配置选项
 */
export interface TOTPOptions {
  /** 验证码位数，默认 6 */
  digits?: number;
  /** 时间步长（秒），默认 30 */
  period?: number;
  /** 哈希算法，默认 SHA-1（兼容性最佳） */
  algorithm?: "SHA-1" | "SHA-256" | "SHA-512";
  /** 时间窗口容差（前后各多少个时间窗口），默认 1 */
  window?: number;
}

/**
 * TOTP 管理器接口
 * 提供密钥生成、URI 生成、验证码生成与校验能力
 */
export interface TOTPManager {
  /**
   * 生成随机 Base32 编码的密钥
   * @returns Base32 密钥字符串
   */
  generateSecret(): string;

  /**
   * 生成 otpauth:// URI（用于二维码扫描）
   * @param secret Base32 密钥
   * @param issuer 服务名称/发行方
   * @param account 用户账号
   * @returns otpauth URI 字符串
   */
  generateURI(secret: string, issuer: string, account: string): string;

  /**
   * 生成当前时间步的 TOTP 验证码
   * @param secret Base32 密钥
   * @param time 可选的指定时间（秒级 Unix 时间戳），默认当前时间
   * @returns 数字验证码字符串
   */
  generate(secret: string, time?: number): Promise<string>;

  /**
   * 校验 TOTP 验证码
   * @param secret Base32 密钥
   * @param token 用户输入的验证码
   * @param time 可选的指定时间（秒级 Unix 时间戳），默认当前时间
   * @returns 校验通过返回 true，否则返回 false
   */
  verify(secret: string, token: string, time?: number): Promise<boolean>;

  /**
   * 校验并消费 TOTP 验证码（防止重放攻击）
   * 同一验证码在同一时间窗口内只能使用一次
   * @param secret Base32 密钥
   * @param token 用户输入的验证码
   * @param time 可选的指定时间（秒级 Unix 时间戳），默认当前时间
   * @returns 校验通过且未被使用返回 true，否则返回 false
   */
  verifyAndConsume(secret: string, token: string, time?: number): Promise<boolean>;
}

// Base32 (RFC 4648) A-Z2-7
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * 将字节数组编码为 Base32 字符串（RFC 4648）
 * @param data 字节数组
 * @returns Base32 编码字符串
 */
function base32Encode(data: Uint8Array): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | data[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

/**
 * 将 Base32 字符串解码为字节数组（RFC 4648）
 * @param encoded Base32 编码字符串
 * @returns 字节数组
 */
function base32Decode(encoded: string): Uint8Array {
  const cleaned = encoded.replace(/=+$/, "").toUpperCase();
  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]!);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }

  return new Uint8Array(output);
}

/** 算法名称映射表（Web Crypto API 兼容） */
const ALGORITHM_MAP: Record<string, string> = {
  "SHA-1": "SHA-1",
  "SHA-256": "SHA-256",
  "SHA-512": "SHA-512",
};

/**
 * 创建 TOTP 管理器实例
 * 基于 RFC 6238（TOTP）和 RFC 4226（HOTP）实现
 * @param options TOTP 配置选项
 * @returns TOTP 管理器实例
 */
export function createTOTP(options: TOTPOptions = {}): TOTPManager {
  const digits = options.digits ?? 6;
  const period = options.period ?? 30;
  const algorithm = options.algorithm ?? "SHA-1";
  const window = options.window ?? 1;

  // Track consumed codes for replay protection: key = "hashOfSecret:counter", value = expiry timestamp
  const consumedCodes = new Map<string, number>();

  /**
   * 对密钥进行 SHA-256 哈希，生成用于 consumedCodes key 的唯一标识
   * @param secret Base32 密钥字符串
   * @returns 十六进制哈希字符串
   */
  async function hashSecret(secret: string): Promise<string> {
    const data = new TextEncoder().encode(secret);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * 使用 HMAC-SHA 对数据签名
   * @param secret 密钥字节数组
   * @param data 待签名数据字节数组
   * @returns 签名结果字节数组
   */
  async function hmacSign(secret: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey(
      "raw",
      secret as unknown as Uint8Array<ArrayBuffer>,
      { name: "HMAC", hash: ALGORITHM_MAP[algorithm]! },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, data as unknown as Uint8Array<ArrayBuffer>);
    return new Uint8Array(sig);
  }

  /**
   * 将整数编码为大端序 8 字节数组
   * @param num 整数
   * @returns 大端序 8 字节数组
   */
  function intToBytes(num: number): Uint8Array {
    const bytes = new Uint8Array(8);
    // Big-endian 8-byte encoding
    let n = num;
    for (let i = 7; i >= 0; i--) {
      bytes[i] = n & 0xff;
      n = Math.floor(n / 256);
    }
    return bytes;
  }

  /**
   * 生成一次性密码（OTP）
   * @param secret 密钥字节数组
   * @param counter 时间计数器
   * @returns 数字验证码字符串
   */
  async function generateOTP(secret: Uint8Array, counter: number): Promise<string> {
    const counterBytes = intToBytes(counter);
    const hash = await hmacSign(secret, counterBytes);

    // Dynamic truncation (RFC 4226)
    const offset = hash[hash.length - 1]! & 0x0f;
    const code =
      ((hash[offset]! & 0x7f) << 24) |
      ((hash[offset + 1]! & 0xff) << 16) |
      ((hash[offset + 2]! & 0xff) << 8) |
      (hash[offset + 3]! & 0xff);

    const otp = code % 10 ** digits;
    return otp.toString().padStart(digits, "0");
  }

  return {
    generateSecret(): string {
      const bytes = new Uint8Array(20);
      crypto.getRandomValues(bytes);
      return base32Encode(bytes);
    },

    generateURI(secret: string, issuer: string, account: string): string {
      const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
      const params = new URLSearchParams({
        secret,
        issuer,
        algorithm: algorithm.replace("-", ""),
        digits: digits.toString(),
        period: period.toString(),
      });
      return `otpauth://totp/${label}?${params.toString()}`;
    },

    async generate(secret: string, time?: number): Promise<string> {
      const t = time ?? Math.floor(Date.now() / 1000);
      const counter = Math.floor(t / period);
      const secretBytes = base32Decode(secret);
      return generateOTP(secretBytes, counter);
    },

    async verify(secret: string, token: string, time?: number): Promise<boolean> {
      const t = time ?? Math.floor(Date.now() / 1000);
      const counter = Math.floor(t / period);
      const secretBytes = base32Decode(secret);

      for (let i = -window; i <= window; i++) {
        const otp = await generateOTP(secretBytes, counter + i);
        if (otp === token) {
          return true;
        }
      }

      return false;
    },

    async verifyAndConsume(secret: string, token: string, time?: number): Promise<boolean> {
      const t = time ?? Math.floor(Date.now() / 1000);
      const counter = Math.floor(t / period);
      const secretBytes = base32Decode(secret);

      // Find which counter matches
      let matchedCounter: number | null = null;
      for (let i = -window; i <= window; i++) {
        const otp = await generateOTP(secretBytes, counter + i);
        if (otp === token) {
          matchedCounter = counter + i;
          break;
        }
      }

      if (matchedCounter === null) {
        return false;
      }

      // Create a unique key for this (secret, counter) pair
      const secretHash = await hashSecret(secret);
      const key = `${secretHash}:${matchedCounter}`;

      // Check if already consumed
      const expiry = consumedCodes.get(key);
      if (expiry !== undefined) {
        if (expiry > Date.now()) {
          return false; // Already used
        }
        // Clean up expired entry
        consumedCodes.delete(key);
      }

      // Mark as consumed with expiry = period * (window + 1) seconds from now
      const ttlMs = period * (window + 1) * 1000;
      consumedCodes.set(key, Date.now() + ttlMs);

      // Clean up other expired entries (lazy cleanup)
      const now = Date.now();
      for (const [k, v] of consumedCodes) {
        if (v <= now) {
          consumedCodes.delete(k);
        }
      }

      return true;
    },
  };
}
```
## 5. Token Refresh
```typescript
/**
 * @ventostack/auth - JWT Token Refresh & Revocation
 * Access Token 与 Refresh Token 分离，不共用密钥与生命周期
 * 实现 Token 轮换机制：刷新时旧的 Refresh Token 被吊销，生成全新 Token 对
 */

import type { JWTManager, JWTPayload } from "./jwt";
import type { TokenRevocationStore } from "./token-revocation-store";
import { createMemoryRevocationStore } from "./token-revocation-store";

/**
 * Token 对结构
 * 包含访问令牌和刷新令牌及其过期时间
 */
export interface TokenPair {
  /** 访问令牌（短有效期） */
  accessToken: string;
  /** 刷新令牌（长有效期） */
  refreshToken: string;
  /** 访问令牌过期时间（秒） */
  expiresIn: number;
  /** 刷新令牌过期时间（秒） */
  refreshExpiresIn: number;
}

/**
 * Token 刷新管理器配置选项
 */
export interface TokenRefreshOptions {
  /** 访问令牌 TTL（秒），默认 900（15 分钟） */
  accessTokenTTL?: number;
  /** 刷新令牌 TTL（秒），默认 604800（7 天） */
  refreshTokenTTL?: number;
  /** 可选的独立刷新令牌密钥，不传则使用 JWT 的 secret */
  refreshSecret?: string;
  /** 外部吊销存储，不传则使用内存存储 */
  revocationStore?: TokenRevocationStore;
}

/**
 * Token 刷新管理器接口
 * 提供 Token 对的生成、刷新与吊销能力
 */
export interface TokenRefreshManager {
  /**
   * 生成新的 Access Token 与 Refresh Token 对
   * @param payload JWT 载荷数据
   * @param secret 签名密钥
   * @returns Token 对
   */
  generatePair(payload: Record<string, unknown>, secret: string): Promise<TokenPair>;

  /**
   * 用 Refresh Token 换取新的 Token 对
   * 旧的 Refresh Token 会被吊销（轮换机制）
   * @param refreshToken 刷新令牌
   * @param secret 签名密钥
   * @returns 新的 Token 对
   */
  refresh(refreshToken: string, secret: string): Promise<TokenPair>;

  /**
   * 吊销指定 JTI 的 Token
   * @param jti JWT ID
   */
  revoke(jti: string): Promise<void>;

  /**
   * 判断指定 JTI 是否已被吊销
   * @param jti JWT ID
   * @returns 已吊销返回 true，否则返回 false
   */
  isRevoked(jti: string): Promise<boolean>;
}

/** 默认访问令牌 TTL（秒） */
const DEFAULT_ACCESS_TTL = 900;
/** 默认刷新令牌 TTL（秒） */
const DEFAULT_REFRESH_TTL = 604800;

/**
 * 创建 Token 刷新管理器实例
 * 实现 Access/Refresh Token 分离、Token 轮换与吊销机制
 * @param jwt JWT 管理器实例
 * @param options Token 刷新配置选项
 * @returns Token 刷新管理器实例
 */
export function createTokenRefresh(
  jwt: JWTManager,
  options: TokenRefreshOptions = {},
): TokenRefreshManager {
  const accessTTL = options.accessTokenTTL ?? DEFAULT_ACCESS_TTL;
  const refreshTTL = options.refreshTokenTTL ?? DEFAULT_REFRESH_TTL;
  const refreshSecret = options.refreshSecret;
  const revocationStore = options.revocationStore ?? createMemoryRevocationStore();

  /**
   * 根据载荷生成 Token 对
   * @param payload JWT 载荷
   * @param secret 签名密钥
   * @returns Token 对
   */
  async function generatePairFromPayload(
    payload: Record<string, unknown>,
    secret: string,
  ): Promise<TokenPair> {
    const accessJTI = crypto.randomUUID();
    const refreshJTI = crypto.randomUUID();

    const accessToken = await jwt.sign(
      { ...payload, jti: accessJTI, iss: "access" } as JWTPayload,
      secret,
      { expiresIn: accessTTL },
    );

    const refreshToken = await jwt.sign(
      { ...payload, jti: refreshJTI, iss: "refresh" } as JWTPayload,
      refreshSecret ?? secret,
      { expiresIn: refreshTTL },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTTL,
      refreshExpiresIn: refreshTTL,
    };
  }

  return {
    async generatePair(payload: Record<string, unknown>, secret: string): Promise<TokenPair> {
      return generatePairFromPayload(payload, secret);
    },

    async refresh(refreshToken: string, secret: string): Promise<TokenPair> {
      const decoded = await jwt.verify(refreshToken, refreshSecret ?? secret);

      if (decoded.iss !== "refresh") {
        throw new Error("无效的令牌类型：需要刷新令牌");
      }

      if (decoded.jti && (await revocationStore.has(decoded.jti))) {
        throw new Error("令牌已被撤销");
      }

      // Revoke the old refresh token
      if (decoded.jti) {
        await revocationStore.add(decoded.jti, refreshTTL * 1000);
      }

      // Strip internal fields before generating new pair
      const { jti: _jti, iss: _iss, iat: _iat, exp: _exp, nbf: _nbf, ...payload } = decoded;

      return generatePairFromPayload(payload, secret);
    },

    async revoke(jti: string): Promise<void> {
      await revocationStore.add(jti, refreshTTL * 1000);
    },

    async isRevoked(jti: string): Promise<boolean> {
      return revocationStore.has(jti);
    },
  };
}
```
## 6. Row Filter
```typescript
/**
 * @ventostack/auth - 资源级权限细控（数据行过滤）
 * 根据用户/租户上下文自动生成 SQL WHERE 条件，实现数据行级隔离
 * 支持静态值、用户属性、租户属性三种值来源
 */

/**
 * 行级过滤规则定义
 * 描述对某资源按某字段进行过滤的条件
 */
export interface RowFilterRule {
  /** 资源/表名，* 表示通配所有资源 */
  resource: string;
  /** 过滤条件字段名 */
  field: string;
  /** 操作符 */
  operator: "eq" | "in" | "neq" | "not_in";
  /** 值来源：user 表示从用户属性取，tenant 表示从租户属性取，static 表示静态值 */
  valueFrom: "user" | "tenant" | "static";
  /** 静态值或属性路径（当 valueFrom 为 user/tenant 时） */
  value: string;
}

/**
 * 行级过滤上下文
 * 包含当前请求的用户、租户、角色及附加属性
 */
export interface RowFilterContext {
  /** 用户 ID */
  userId?: string;
  /** 租户 ID */
  tenantId?: string;
  /** 用户角色列表 */
  roles?: string[];
  /** 附加属性（用于动态取值） */
  attributes?: Record<string, unknown>;
}

/**
 * 行级过滤器接口
 * 根据用户/租户上下文自动生成 WHERE 条件
 */
export interface RowFilter {
  /**
   * 添加过滤规则
   * @param rule 过滤规则
   */
  addRule(rule: RowFilterRule): void;

  /**
   * 获取指定资源在给定上下文下的过滤条件列表
   * @param resource 资源/表名
   * @param ctx 过滤上下文
   * @returns 过滤条件子句列表
   */
  getFilters(resource: string, ctx: RowFilterContext): RowFilterClause[];

  /**
   * 获取所有已注册的过滤规则
   * @returns 过滤规则列表
   */
  getRules(): RowFilterRule[];

  /**
   * 构建 SQL WHERE 子句
   * @param resource 资源/表名
   * @param ctx 过滤上下文
   * @returns SQL WHERE 子句字符串，无过滤条件时返回空字符串
   */
  buildWhereClause(resource: string, ctx: RowFilterContext): string;
}

/**
 * 过滤条件子句结构
 */
export interface RowFilterClause {
  /** 字段名 */
  field: string;
  /** SQL 操作符 */
  operator: string;
  /** 过滤值 */
  value: unknown;
}

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function assertSafeIdentifier(identifier: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return identifier;
}

function formatSqlLiteral(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("SQL filter value must be a finite number");
    }
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function isMissingFilterValue(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.length === 0);
}

/**
 * 创建行级数据过滤器实例
 * 根据用户/租户上下文自动生成 WHERE 条件，实现数据行级隔离
 * @returns 行级过滤器实例
 */
export function createRowFilter(): RowFilter {
  const rules: RowFilterRule[] = [];

  /**
   * 根据规则与上下文解析实际过滤值
   * @param rule 过滤规则
   * @param ctx 过滤上下文
   * @returns 解析后的过滤值
   */
  function resolveValue(rule: RowFilterRule, ctx: RowFilterContext): unknown {
    switch (rule.valueFrom) {
      case "user":
        return ctx.userId ?? ctx.attributes?.[rule.value];
      case "tenant":
        return ctx.tenantId ?? ctx.attributes?.[rule.value];
      case "static":
        return rule.value;
      default:
        return rule.value;
    }
  }

  /**
   * 将内部操作符转换为 SQL 操作符
   * @param op 内部操作符
   * @returns SQL 操作符字符串
   */
  function toSqlOperator(op: RowFilterRule["operator"]): string {
    switch (op) {
      case "eq":
        return "=";
      case "neq":
        return "!=";
      case "in":
        return "IN";
      case "not_in":
        return "NOT IN";
    }
  }

  return {
    addRule(rule: RowFilterRule): void {
      assertSafeIdentifier(rule.field);
      rules.push(rule);
    },

    getFilters(resource: string, ctx: RowFilterContext): RowFilterClause[] {
      return rules
        .filter((r) => r.resource === resource || r.resource === "*")
        .map((r) => ({
          field: r.field,
          operator: toSqlOperator(r.operator),
          value: resolveValue(r, ctx),
        }));
    },

    getRules(): RowFilterRule[] {
      return [...rules];
    },

    buildWhereClause(resource: string, ctx: RowFilterContext): string {
      const filters = this.getFilters(resource, ctx);
      if (filters.length === 0) return "";

      if (filters.some((filter) => isMissingFilterValue(filter.value))) {
        return "WHERE 1 = 0";
      }

      const conditions = filters.map((f) => {
        const field = assertSafeIdentifier(f.field);

        if (f.operator === "IN" || f.operator === "NOT IN") {
          const vals = Array.isArray(f.value) ? f.value : [f.value];
          return `${field} ${f.operator} (${vals.map((v) => formatSqlLiteral(v)).join(", ")})`;
        }

        if (f.value === null) {
          return `${field} ${f.operator === "!=" ? "IS NOT NULL" : "IS NULL"}`;
        }

        return `${field} ${f.operator} ${formatSqlLiteral(f.value)}`;
      });

      return `WHERE ${conditions.join(" AND ")}`;
    },
  };
}
```
## 7. Policy Engine (ABAC)
```typescript
/**
 * @ventostack/auth - 策略引擎
 * 类 Casbin 的策略模型，支持通配符匹配与条件表达式
 * 默认 deny，只有匹配 allow 规则且无 deny 规则时才允许访问
 */

/**
 * 策略规则定义
 * 描述哪些主体对哪些资源执行哪些操作时被允许或拒绝
 */
export interface PolicyRule {
  /** 生效类型：allow 表示允许，deny 表示拒绝 */
  effect: "allow" | "deny";
  /** 主体匹配模式列表（支持 * 通配符） */
  subjects: string[];
  /** 资源匹配模式列表（支持 * 通配符） */
  resources: string[];
  /** 操作匹配模式列表（支持 * 通配符） */
  actions: string[];
  /** 可选的条件表达式列表 */
  conditions?: PolicyConditionDef[];
}

/**
 * 策略条件定义
 * 用于对请求属性进行细粒度匹配
 */
export interface PolicyConditionDef {
  /** 要比较的属性字段名 */
  field: string;
  /** 比较操作符 */
  operator: "eq" | "neq" | "in" | "not_in" | "gt" | "lt" | "gte" | "lte" | "matches";
  /** 比较目标值 */
  value: unknown;
}

/**
 * 策略评估上下文
 * 包含当前请求的主体、资源、操作及附加属性
 */
export interface PolicyEvalContext {
  /** 主体标识 */
  subject: string;
  /** 资源标识 */
  resource: string;
  /** 操作类型 */
  action: string;
  /** 可选的附加属性（用于条件表达式） */
  attributes?: Record<string, unknown>;
}

/**
 * 策略引擎接口
 * 提供策略规则的增删改查与访问请求评估能力
 */
export interface PolicyEngine {
  /**
   * 添加策略规则
   * @param rule 策略规则
   */
  addRule(rule: PolicyRule): void;

  /**
   * 移除指定索引的策略规则
   * @param index 规则索引
   * @returns 成功移除返回 true，索引越界返回 false
   */
  removeRule(index: number): boolean;

  /**
   * 评估访问请求
   * @param ctx 评估上下文
   * @returns 包含 allowed（是否允许）和 matchedRule（匹配的规则）的结果
   */
  evaluate(ctx: PolicyEvalContext): { allowed: boolean; matchedRule?: PolicyRule };

  /**
   * 获取所有已注册的策略规则
   * @returns 策略规则列表
   */
  getRules(): PolicyRule[];

  /**
   * 清空所有策略规则
   */
  clear(): void;
}

/**
 * 判断值是否匹配模式（支持 * 通配符）
 * @param value 待匹配值
 * @param pattern 匹配模式
 * @returns 匹配返回 true，否则返回 false
 */
function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.includes("*")) {
    const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    return regex.test(value);
  }
  return value === pattern;
}

/**
 * 评估单个条件表达式
 * @param condition 条件定义
 * @param attributes 属性上下文
 * @returns 条件满足返回 true，否则返回 false
 */
function evaluateCondition(
  condition: PolicyConditionDef,
  attributes: Record<string, unknown>,
): boolean {
  const fieldValue = attributes[condition.field];

  switch (condition.operator) {
    case "eq":
      return fieldValue === condition.value;
    case "neq":
      return fieldValue !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case "not_in":
      return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
    case "gt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue > condition.value
      );
    case "lt":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue < condition.value
      );
    case "gte":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue >= condition.value
      );
    case "lte":
      return (
        typeof fieldValue === "number" &&
        typeof condition.value === "number" &&
        fieldValue <= condition.value
      );
    case "matches":
      return (
        typeof fieldValue === "string" &&
        typeof condition.value === "string" &&
        new RegExp(condition.value).test(fieldValue)
      );
    default:
      return false;
  }
}

/**
 * 创建策略引擎实例
 * 支持类 Casbin 的策略模型：subject, resource, action + conditions
 * 默认 deny，只有匹配 allow 规则且无 deny 规则时才允许
 * @returns 策略引擎实例
 */
export function createPolicyEngine(): PolicyEngine {
  const rules: PolicyRule[] = [];

  return {
    addRule(rule: PolicyRule): void {
      rules.push(rule);
    },

    removeRule(index: number): boolean {
      if (index < 0 || index >= rules.length) return false;
      rules.splice(index, 1);
      return true;
    },

    evaluate(ctx: PolicyEvalContext): { allowed: boolean; matchedRule?: PolicyRule } {
      let allowed = false;
      let matchedRule: PolicyRule | undefined;

      for (const rule of rules) {
        // 匹配 subject
        const subjectMatch = rule.subjects.some((s) => matchesPattern(ctx.subject, s));
        if (!subjectMatch) continue;

        // 匹配 resource
        const resourceMatch = rule.resources.some((r) => matchesPattern(ctx.resource, r));
        if (!resourceMatch) continue;

        // 匹配 action
        const actionMatch = rule.actions.some((a) => matchesPattern(ctx.action, a));
        if (!actionMatch) continue;

        // 匹配条件
        if (rule.conditions && ctx.attributes) {
          const conditionsMatch = rule.conditions.every((c) =>
            evaluateCondition(c, ctx.attributes!),
          );
          if (!conditionsMatch) continue;
        } else if (rule.conditions && !ctx.attributes) {
          continue;
        }

        // deny 优先
        if (rule.effect === "deny") {
          return { allowed: false, matchedRule: rule };
        }

        if (rule.effect === "allow") {
          allowed = true;
          matchedRule = rule;
        }
      }

      const result: { allowed: boolean; matchedRule?: PolicyRule } = { allowed };
      if (matchedRule) result.matchedRule = matchedRule;
      return result;
    },

    getRules(): PolicyRule[] {
      return [...rules];
    },

    clear(): void {
      rules.length = 0;
    },
  };
}
```
