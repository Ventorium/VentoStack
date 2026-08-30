/**
 * 环境变量定义、读取与校验
 *
 * 使用 @ventostack/core 的 createConfig 统一管理配置，
 * 支持类型推导、默认值、必填校验、枚举约束和敏感字段脱敏。
 */

import { createConfig } from '@ventostack/core';

const rawConfig = createConfig(
  {
    NODE_ENV: {
      type: 'string',
      env: 'NODE_ENV',
      default: 'development',
      options: ['development', 'production', 'test'],
    },
    PORT: { type: 'number', env: 'PORT', default: 9320 },
    HOST: { type: 'string', env: 'HOST', default: '0.0.0.0' },
    // ---- 管理端口（健康检查、指标、OpenAPI 文档）----
    ADMIN_PORT: {
      type: 'number',
      env: 'ADMIN_PORT',
      default: 9322,
      description: '管理端口（/health, /metrics, /docs）。设为 0 则禁用独立端口，回退到主端口。',
    },
    ADMIN_HOST: {
      type: 'string',
      env: 'ADMIN_HOST',
      default: '127.0.0.1',
      description: '管理端口绑定地址，默认仅本地访问。',
    },
    DATABASE_URL: {
      type: 'string',
      env: 'DATABASE_URL',
      required: true,
      sensitive: true,
    },
    JWT_SECRET: {
      type: 'string',
      env: 'JWT_SECRET',
      required: true,
      sensitive: true,
    },
    ALLOWED_ORIGINS: {
      type: 'string',
      env: 'ALLOWED_ORIGINS',
      default: 'http://localhost:9321',
    },
    LOG_LEVEL: {
      type: 'string',
      env: 'LOG_LEVEL',
      default: 'info',
      options: ['debug', 'info', 'warn', 'error'],
    },
    MAX_BODY_SIZE: {
      type: 'number',
      env: 'MAX_BODY_SIZE',
      default: 1024 * 1024,
      description: '全局请求体上限（字节，最小 1024）。文件上传走独立上传通道不受此限制',
    },
    CACHE_DRIVER: {
      type: 'string',
      env: 'CACHE_DRIVER',
      default: 'memory',
      options: ['memory', 'redis'],
    },
    REDIS_URL: { type: 'string', env: 'REDIS_URL' },
    DB_POOL_SIZE: {
      type: 'number',
      env: 'DB_POOL_SIZE',
      default: 10,
    },
    SESSION_TTL_SECONDS: {
      type: 'number',
      env: 'SESSION_TTL_SECONDS',
      default: 1800,
    },
    MAX_DEVICES_PER_USER: {
      type: 'number',
      env: 'MAX_DEVICES_PER_USER',
      default: 5,
    },
    BCRYPT_COST: { type: 'number', env: 'BCRYPT_COST', default: 10 },
    COOKIE_SECURE: {
      type: 'boolean',
      env: 'COOKIE_SECURE',
      default: false,
      description: '认证 Cookie 是否附加 Secure 属性。生产环境（反代 TLS 终结）必须设为 true，防止令牌 Cookie 明文传输',
    },
    ADMIN_INIT_PASSWORD: {
      type: 'string',
      env: 'ADMIN_INIT_PASSWORD',
      sensitive: true,
      description: '初始 admin 用户密码（仅首次初始化种子时使用）。生产环境必填，禁止使用默认值',
    },
    WEBAUTHN_RP_ID: { type: 'string', env: 'WEBAUTHN_RP_ID', default: 'localhost' },
    WEBAUTHN_RP_NAME: { type: 'string', env: 'WEBAUTHN_RP_NAME', default: 'VentoStack Admin' },
    TRUSTED_PROXIES: {
      type: 'string',
      env: 'TRUSTED_PROXIES',
      default: '',
      description: '可信反向代理 IP/CIDR 列表（逗号分隔）。配置后登录审计/限流/操作日志将读取代理头提取真实客户端 IP；留空则仅使用直接连接 IP，防止伪造',
    },
    // ---- Storage ----
    STORAGE_DRIVER: {
      type: 'string',
      env: 'STORAGE_DRIVER',
      default: 'local',
      options: ['local', 's3'],
    },
    STORAGE_LOCAL_PATH: {
      type: 'string',
      env: 'STORAGE_LOCAL_PATH',
      default: './uploads',
    },
    STORAGE_LOCAL_BASE_URL: {
      type: 'string',
      env: 'STORAGE_LOCAL_BASE_URL',
      default: '/uploads',
    },
    S3_ENDPOINT: { type: 'string', env: 'S3_ENDPOINT' },
    S3_BUCKET: { type: 'string', env: 'S3_BUCKET' },
    S3_ACCESS_KEY_ID: {
      type: 'string',
      env: 'S3_ACCESS_KEY_ID',
      sensitive: true,
    },
    S3_SECRET_ACCESS_KEY: {
      type: 'string',
      env: 'S3_SECRET_ACCESS_KEY',
      sensitive: true,
    },
    S3_REGION: { type: 'string', env: 'S3_REGION', default: 'auto' },
    S3_PUBLIC_BASE_URL: { type: 'string', env: 'S3_PUBLIC_BASE_URL' },
    // ---- Tenant ----
    TENANT_ENABLED: {
      type: 'boolean',
      env: 'TENANT_ENABLED',
      default: false,
      description: '[实验性] 多租户隔离开关：数据模型层尚未实现租户列与查询过滤，开启仅影响 boot 预留配置，不提供真实隔离',
    },
    AI_ENABLED: {
      type: 'boolean',
      env: 'AI_ENABLED',
      default: false,
      description: '是否启用 AI 平台模块',
    },
    AI_CREDENTIAL_ENCRYPTION_KEY: {
      type: 'string',
      env: 'AI_CREDENTIAL_ENCRYPTION_KEY',
      sensitive: true,
    },
    AI_DEFAULT_MODEL: {
      type: 'string',
      env: 'AI_DEFAULT_MODEL',
      default: 'default',
    },
    AI_STORAGE_PATH: {
      type: 'string',
      env: 'AI_STORAGE_PATH',
      default: './data/ai',
    },
  },
  process.env,
);

// 跨字段校验
if (rawConfig.CACHE_DRIVER === 'redis' && !rawConfig.REDIS_URL) {
  throw new Error('REDIS_URL is required when CACHE_DRIVER=redis');
}
// 生产环境拒绝已知占位符凭据原样上线
const JWT_SECRET_PLACEHOLDER = 'change-me-at-least-32-chars-long';
if (rawConfig.NODE_ENV === 'production') {
  if (rawConfig.JWT_SECRET.includes(JWT_SECRET_PLACEHOLDER)) {
    throw new Error(
      'JWT_SECRET 仍为示例占位符，生产环境拒绝启动。请设置真实凭据后重新部署',
    );
  }
  // DATABASE_URL 仅检查密码段是否为占位符，避免真实凭据中碰巧含占位子串被误杀
  let dbPassword: string;
  try {
    dbPassword = new URL(rawConfig.DATABASE_URL).password;
  } catch {
    // 非标准 URL 格式退化为整串等值比较
    dbPassword = rawConfig.DATABASE_URL.trim();
  }
  if (dbPassword === 'change-me') {
    throw new Error(
      'DATABASE_URL 的数据库口令仍为示例占位符，生产环境拒绝启动。请设置真实凭据后重新部署',
    );
  }
  // ADMIN_INIT_PASSWORD：生产环境必填且禁止默认值，防止全新数据库以 admin123 默认凭据上线
  const ADMIN_PASSWORD_DEFAULT = 'admin123';
  if (!rawConfig.ADMIN_INIT_PASSWORD) {
    throw new Error(
      'ADMIN_INIT_PASSWORD 未设置，生产环境拒绝启动。请设置初始 admin 密码后重新部署',
    );
  }
  if (rawConfig.ADMIN_INIT_PASSWORD === ADMIN_PASSWORD_DEFAULT) {
    throw new Error(
      'ADMIN_INIT_PASSWORD 仍为默认值 admin123，生产环境拒绝启动。请设置强密码后重新部署',
    );
  }
}
if (rawConfig.STORAGE_DRIVER === 's3') {
  if (!rawConfig.S3_BUCKET) throw new Error('S3_BUCKET is required when STORAGE_DRIVER=s3');
  if (!rawConfig.S3_ACCESS_KEY_ID)
    throw new Error('S3_ACCESS_KEY_ID is required when STORAGE_DRIVER=s3');
  if (!rawConfig.S3_SECRET_ACCESS_KEY)
    throw new Error('S3_SECRET_ACCESS_KEY is required when STORAGE_DRIVER=s3');
}
if (rawConfig.AI_ENABLED) {
  const encryptionKeyBytes = new TextEncoder().encode(
    rawConfig.AI_CREDENTIAL_ENCRYPTION_KEY ?? '',
  ).length;
  if (encryptionKeyBytes !== 32) {
    throw new Error('AI_CREDENTIAL_ENCRYPTION_KEY must be exactly 32 bytes when AI_ENABLED=true');
  }
}

// JWT_SECRET 密钥长度校验（256-bit = 32 字节）
const jwtSecretBytes = new TextEncoder().encode(rawConfig.JWT_SECRET).length;
if (jwtSecretBytes < 32) {
  throw new Error(
    `JWT_SECRET must be at least 32 bytes (256-bit), got ${jwtSecretBytes} bytes. ` +
      `Current value length: ${rawConfig.JWT_SECRET.length} characters.`,
  );
}

// ALLOWED_ORIGINS: 逗号分隔 → string[]
export const env = {
  ...rawConfig,
  ALLOWED_ORIGINS: rawConfig.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
  TRUSTED_PROXIES: rawConfig.TRUSTED_PROXIES
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
};

export type EnvVars = typeof env;
