/**
 * @ventostack/boot - 平台聚合器
 *
 * 一键创建完整的 VentoStack 平台，聚合所有业务模块。
 */

import {
  type AuthSessionManager,
  type JWTManager,
  type MultiDeviceManager,
  type PasswordHasher,
  type RBAC,
  type SessionManager,
  type TOTPManager,
  type TokenRefreshManager,
  createAuthMiddleware,
  createPermMiddleware,
} from '@ventostack/auth';
import type { Cache } from '@ventostack/cache';
import type { Middleware, Router } from '@ventostack/core';
import { createConfigEncryptor, createRouter, createTagLogger } from '@ventostack/core';
import type { Database, SqlExecutor, TableSchemaInfo } from '@ventostack/database';
import { createDatabase } from '@ventostack/database';
import type { EventBus } from '@ventostack/events';
import type { AuditStore, HealthCheck } from '@ventostack/observability';

import type { Scheduler } from '@ventostack/events';
import { createGenModule } from '@ventostack/gen';
import type { GenModule } from '@ventostack/gen';
import { createI18nModule } from '@ventostack/i18n';
import type { I18nModule } from '@ventostack/i18n';
import { createMonitorModule } from '@ventostack/monitor';
import type { MonitorModule } from '@ventostack/monitor';
import { createNotificationModule } from '@ventostack/notification';
import type { NotificationModule, NotifyChannel } from '@ventostack/notification';
import { createOAuthModule } from '@ventostack/oauth';
import type { OAuthModule } from '@ventostack/oauth';
import { createOSSModule } from '@ventostack/oss';
import type { OSSModule, StorageAdapter } from '@ventostack/oss';
import { createSchedulerModule } from '@ventostack/scheduler';
import type { JobHandlerMap, SchedulerModule } from '@ventostack/scheduler';
import { createSystemModule } from '@ventostack/system';
import type { FileUploader, SystemModule } from '@ventostack/system';
import { createWorkflowModule, workflowInstanceCompleted } from '@ventostack/workflow';
import type { WorkflowModule } from '@ventostack/workflow';

// ---- AI 可选模块类型 ----
//
// @ventostack/ai 与 @ventostack/ai-context 是 optionalDependencies：
// 未启用 AI 的应用（如纯管理后台）不需要安装这两个包。
// 因此 boot 不在顶层 import 它们，仅在 modules.ai === true 时动态加载，
// 并以下列最小结构化类型描述其模块形状（结构兼容即可，无运行时依赖）。

/** LLM Provider 配置（与 @ventostack/ai 的 LLMProviderConfig 结构兼容） */
export interface LLMProviderConfig {
  /** Provider 名称 */
  name: string;
  /** 线协议；Provider 名称与协议解耦，兼容聚合网关及私有 Provider。 */
  apiFormat?: 'openai_chat' | 'openai_response' | 'anthropic' | 'google' | (string & {});
  /** API Key */
  apiKey: string;
  /** 自定义 Base URL */
  baseUrl?: string;
  /** Provider 专用请求头。 */
  headers?: Record<string, string>;
}

/** AI 模块最小结构（createAIModule 返回值，结构兼容即可） */
export interface AIModule {
  services: {
    /** 事件发射器，供 ai-context 订阅 */
    eventEmitter: unknown;
    /** 会话统一入口（渠道侧复用，避免渠道自建一套会话） */
    sessionService?: unknown;
    /** Agent 循环（渠道内直接运行 Agent，不经过 HTTP） */
    agentLoop?: unknown;
    /** 请求级工具注册表工厂（渠道工具由 extraTools 注入） */
    createToolRegistry?: (
      tenantId: string,
      userId?: string,
      sessionId?: string,
    ) => Promise<unknown>;
    /** 通知摘要用的模型网关 */
    llmGateway?: unknown;
    /** Agent 读取（取 summaryModel） */
    agentCrud?: {
      list(params: {
        tenantId: string;
        userId: string;
        isAdmin: boolean;
        page?: number;
        pageSize?: number;
      }): Promise<{ list: unknown[]; total: number }>;
    };
  };
  router: Router;
  init(): Promise<void>;
  shutdown?(): Promise<void>;
}

/** AI 上下文模块最小结构（createAiContextModule 返回值，结构兼容即可） */
export interface AiContextModule {
  router: Router;
  init(): Promise<void>;
}

/** AI 渠道模块最小结构（createAiChannelModule 返回值，结构兼容即可） */
export interface AiChannelModule {
  services: {
    /** 按会话开关返回渠道工具（注入到 AI 的 extraTools） */
    createTools(params: {
      tenantId: string;
      userId: string;
      sessionId?: string;
    }): Promise<unknown[]>;
    /** 一轮对话结束后的自动推送（注入到 AI 的 onRunFinished） */
    notifier: {
      onRunFinished(params: {
        sessionId: string;
        agentId: string;
        tenantId: string;
        userId: string;
        finalContent: string;
      }): Promise<void>;
    };
  };
  router: Router;
  init(): Promise<void>;
  shutdown?(): Promise<void>;
}

/** 平台配置 */
export interface PlatformConfig {
  /** 数据库 executor */
  executor: SqlExecutor;
  /** 数据库实例（可选，若未提供则自动从 executor 创建） */
  db?: Database;
  /** 数据库表结构读取 */
  readTableSchema: (executor: SqlExecutor, tableName: string) => Promise<TableSchemaInfo>;
  /** 数据库表列表 */
  listTables: (executor: SqlExecutor) => Promise<string[]>;
  /** 缓存 */
  cache: Cache;
  /** JWT 管理 */
  jwt: JWTManager;
  /** JWT 密钥 */
  jwtSecret: string;
  /** 密码哈希 */
  passwordHasher: PasswordHasher;
  /** TOTP 管理器 */
  totpManager: TOTPManager;
  /** RBAC 权限 */
  rbac: RBAC;
  /** 会话管理 */
  authSessionManager: AuthSessionManager;
  /** Token 刷新 */
  tokenRefreshManager: TokenRefreshManager;
  /** Session 管理 */
  sessionManager: SessionManager;
  /** 多设备管理 */
  multiDeviceManager: MultiDeviceManager;
  /** 审计存储 */
  auditStore: AuditStore;
  /** 事件总线 */
  eventBus: EventBus;
  /** 健康检查 */
  healthCheck: HealthCheck;
  /** 调度器 */
  scheduler: Scheduler;

  /** 模块开关 */
  modules?: {
    system?: boolean;
    monitor?: boolean;
    notification?: boolean;
    i18n?: boolean;
    workflow?: boolean;
    oss?: boolean;
    scheduler?: boolean;
    gen?: boolean;
    ai?: boolean;
    /** AI 上下文洞察（依赖 ai 模块，缺省跟随 ai 开关） */
    aiContext?: boolean;
    /** 个人级对话渠道（依赖 ai 模块，缺省跟随 ai 开关） */
    aiChannel?: boolean;
    /** OAuth 2.0 / OpenID Connect 认证中心 */
    oauth?: boolean;
  };

  /** OSS 存储适配器 */
  storageAdapter?: StorageAdapter;
  /** 通知通道 */
  notifyChannels?: Map<string, NotifyChannel>;
  /** 定时任务处理器 */
  jobHandlers?: JobHandlerMap;
  /** WebAuthn RP ID */
  rpID?: string;
  /** WebAuthn RP 名称 */
  rpName?: string;
  /** WebAuthn 允许来源 */
  rpOrigins?: string[];
  /** 可信代理 IP/CIDR 列表，用于安全提取客户端真实 IP */
  trustedProxies?: string[];
  /** AI 模块配置 */
  aiConfig?: {
    llmProviders: LLMProviderConfig[];
    defaultModel: string;
    storagePath?: string;
    /** 恰好 32 字节的 Provider 凭据加密密钥 */
    credentialEncryptionKey: string;
    agentRuntime?: { baseUrl: string; token: string; timeoutMs: number };
    /** 专家数据目录（磁盘权威存储）；默认 ${storagePath}/experts，生产 /app/data/experts */
    expertDataDir?: string;
    /** ExpertHub 地址；默认 CloudSmith 公开前缀 */
    expertHubBaseUrl?: string;
    /** ExpertHub manifest 签名公钥（ed25519 hex）；配置后强制校验 manifest.sig */
    expertHubSigningPubkey?: string;
    /** 对外可访问地址；用于生成连接器 OAuth 的 redirect_uri（缺省时 OAuth 连接 fail-closed） */
    publicBaseUrl?: string;
  };

  /** AI 渠道模块配置（modules.aiChannel 为 true 时生效） */
  aiChannelConfig?: {
    /**
     * 对外可访问地址，用于给飞书/企微/QQ/钉钉回填 webhook 回调地址。
     * 未配置时 webhook 类渠道会在 UI 上提示「先配置公网地址」。
     */
    publicBaseUrl?: string;
    /** 渠道未显式绑定 Agent 时的默认 Agent；缺省按租户取第一个可用 Agent */
    defaultAgentId?: string;
  };

  /** 当前部署的可信租户标识；所有 Admin 资源必须绑定该值 */
  tenantId: string;
  /** @deprecated 保留兼容配置；Admin 中租户隔离始终启用 */
  tenantEnabled?: boolean;
  /** 认证 Cookie 是否附加 Secure 属性（生产环境应设为 true，防止令牌 Cookie 明文传输） */
  secureCookies?: boolean;
  /** OAuth 客户端 Secret 摘要 pepper，至少 32 字节。 */
  oauthSecretPepper?: string;
  /** 仅本地开发时允许 loopback HTTP 客户端 URL。 */
  oauthAllowLoopbackHttp?: boolean;
  oauthIssuer?: string;
  oauthLoginPath?: string;
  oauthSigningKey?: {
    keyId: string;
    privateKeyPem: string;
    publicKeyPem: string;
    verificationJwks?: JsonWebKey[];
  };
}

/** 平台实例 */
export interface Platform {
  /** 系统模块 */
  system?: SystemModule;
  /** 监控模块 */
  monitor?: MonitorModule;
  /** 通知模块 */
  notification?: NotificationModule;
  /** 国际化模块 */
  i18n?: I18nModule;
  /** 工作流模块 */
  workflow?: WorkflowModule;
  /** 文件存储模块 */
  oss?: OSSModule;
  /** 定时任务模块 */
  scheduler?: SchedulerModule;
  /** 代码生成模块 */
  gen?: GenModule;
  ai?: AIModule;
  /** AI 上下文模块 */
  aiContext?: AiContextModule;
  /** AI 对话渠道模块 */
  aiChannel?: AiChannelModule;
  /** OAuth 2.0 / OpenID Connect 模块 */
  oauth?: OAuthModule;
  /** 所有路由的聚合 */
  router: Router;
  /** 初始化所有模块 */
  init(): Promise<void>;
  /** 优雅关停（停长连接、停定时器）；由宿主在 SIGTERM 时调用 */
  shutdown(): Promise<void>;
}

const bootLog = createTagLogger('boot');

/** 动态加载可选 AI 模块（@ventostack/ai 未安装时给出明确指引） */
async function loadAIModule(params: {
  db: Database;
  cache: Cache;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
  permMiddleware: ReturnType<typeof createPermMiddleware>;
  eventBus: EventBus;
  credentialEncryptionKey: string;
  llmProviders: LLMProviderConfig[];
  defaultModel: string;
  storagePath: string;
  agentRuntime?: { baseUrl: string; token: string; timeoutMs: number };
  platformAdminMiddleware?: Middleware;
  notification?: {
    send(params: {
      templateId?: string;
      receiverId: string;
      channel: string;
      title?: string;
      content: string;
      variables?: Record<string, unknown>;
    }): Promise<{ messageId: string }>;
  };
  notifyPlatformAdmins?: (params: {
    tenantId: string;
    title: string;
    content: string;
  }) => Promise<void>;
  /** 渠道工具注入点；channel 模块晚于 ai 模块创建，闭包内按需解析 */
  extraTools?: (params: {
    tenantId: string;
    userId: string;
    sessionId?: string;
  }) => Promise<unknown[]>;
  /** 会话结束钩子；同上 */
  onRunFinished?: (params: {
    sessionId: string;
    agentId: string;
    tenantId: string;
    userId: string;
    finalContent: string;
  }) => Promise<void>;
  /** 对外可访问地址；用于连接器 OAuth 回调地址 */
  publicBaseUrl?: string;
}): Promise<AIModule> {
  let factory: (deps: unknown) => AIModule;
  try {
    factory = (
      (await import('@ventostack/ai')) as {
        createAIModule: (deps: unknown) => AIModule;
      }
    ).createAIModule;
  } catch (error) {
    throw new Error(
      `modules.ai 已启用但未安装 @ventostack/ai（可选依赖）。请安装该包，或将 modules.ai 设为 false。原始错误：${String(error)}`,
    );
  }
  return factory({
    ...params,
    // framework/ai 不依赖 platform/auth：认证与权限中间件由平台组装层注入
    credentialEncryptor: createConfigEncryptor({ key: params.credentialEncryptionKey }),
  });
}

/** 动态加载可选 AI 上下文模块（@ventostack/ai-context 未安装时给出明确指引） */
async function loadAiContextModule(params: {
  db: Database;
  emitter: unknown;
  jwt: JWTManager;
  jwtSecret: string;
  tenantId: string;
}): Promise<AiContextModule> {
  let factory: (deps: unknown) => AiContextModule;
  try {
    factory = (
      (await import('@ventostack/ai-context')) as {
        createAiContextModule: (deps: unknown) => AiContextModule;
      }
    ).createAiContextModule;
  } catch (error) {
    throw new Error(
      `modules.aiContext 已启用但未安装 @ventostack/ai-context（可选依赖）。请安装该包，或将 modules.aiContext 设为 false。原始错误：${String(error)}`,
    );
  }
  return factory(params);
}

/**
 * 动态加载可选 AI 渠道模块（@ventostack/ai-channel 未安装时给出明确指引）
 *
 * 装配顺序是「两段式」：
 *   1. 先建 ai 模块，拿到 sessionService / agentLoop / createToolRegistry；
 *   2. 再用这些能力建渠道模块，并把渠道的 createTools / notifier 通过
 *      extraTools / onRunFinished 注回 ai 模块。
 * 循环引用用「闭包晚绑定」解决：extraTools 在请求期才执行，届时 channel 模块已就绪。
 */
async function loadAiChannelModule(params: {
  db: Database;
  cache: Cache;
  authMiddleware: ReturnType<typeof createAuthMiddleware>;
  permMiddleware: ReturnType<typeof createPermMiddleware>;
  ai: unknown;
  credentialEncryptionKey: string;
  publicBaseUrl?: string;
  defaultAgentId?: string;
  resolveAgentId?(input: { tenantId: string; userId: string }): Promise<string | null>;
}): Promise<AiChannelModule> {
  let factory: (deps: unknown) => AiChannelModule;
  try {
    factory = (
      (await import('@ventostack/ai-channel')) as {
        createAiChannelModule: (deps: unknown) => AiChannelModule;
      }
    ).createAiChannelModule;
  } catch (error) {
    throw new Error(
      `modules.aiChannel 已启用但未安装 @ventostack/ai-channel（可选依赖）。请安装该包，或将 modules.aiChannel 设为 false。原始错误：${String(error)}`,
    );
  }
  return factory({
    ...params,
    // 渠道凭据复用 AI 的加密密钥：同一套部署只需管理一把 32 字节密钥
    encryptor: createConfigEncryptor({ key: params.credentialEncryptionKey }),
  });
}

/**
 * 创建完整的 VentoStack 平台
 */
export async function createPlatform(config: PlatformConfig): Promise<Platform> {
  const {
    executor,
    readTableSchema,
    cache,
    db: providedDb,
    jwt,
    jwtSecret,
    passwordHasher,
    totpManager,
    rbac,
    authSessionManager,
    tokenRefreshManager,
    sessionManager,
    multiDeviceManager,
    auditStore,
    eventBus,
    healthCheck,
    scheduler,
    modules: moduleFlags,
    storageAdapter,
    notifyChannels,
    jobHandlers,
    rpID,
    rpName,
    rpOrigins,
    trustedProxies,
    tenantEnabled,
    tenantId,
    secureCookies,
  } = config;

  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId || normalizedTenantId.length > 36) {
    throw new Error('tenantId must contain 1 to 36 characters');
  }

  const db = providedDb ?? createDatabase({ executor });

  if (moduleFlags?.ai === true && !config.aiConfig) {
    throw new Error('aiConfig is required when the AI module is enabled');
  }

  const enabled = {
    system: moduleFlags?.system !== false,
    monitor: moduleFlags?.monitor !== false,
    notification: moduleFlags?.notification !== false,
    i18n: moduleFlags?.i18n !== false,
    workflow: moduleFlags?.workflow !== false,
    oss: moduleFlags?.oss !== false,
    scheduler: moduleFlags?.scheduler !== false,
    gen: moduleFlags?.gen !== false,
    ai: moduleFlags?.ai === true,
    // 链路追踪依赖 ai 模块：ai 关闭时强制禁用
    aiContext: moduleFlags?.aiContext !== false && moduleFlags?.ai === true,
    // 对话渠道同样依赖 ai 模块（会话 / Agent 循环都在 ai 里）
    aiChannel: moduleFlags?.aiChannel !== false && moduleFlags?.ai === true,
    oauth: moduleFlags?.oauth === true,
  };

  // Create modules
  // OSS 需先于 system 创建：system 的头像上传依赖 fileUploader（OSS 本地/S3 存储），
  // 不配的话头像走 base64 兜底，data URL 会撑爆 sys_user.avatar 的 varchar(512) 直接 500。
  const oss =
    enabled.oss && storageAdapter
      ? createOSSModule({
          db,
          storage: storageAdapter,
          jwt,
          jwtSecret,
          rbac,
          tenantId: normalizedTenantId,
        })
      : undefined;

  // sys_user.avatar 只存短 URL（如 /api/system/oss/<id>/download），不再存 base64。
  // 兜底 base64 分支仅在没有任何存储适配器时保留。
  const fileUploader: FileUploader | undefined = oss
    ? {
        upload: async (filename, data, contentType, bucket, uploaderId) => {
          const record = await oss.services.oss.upload(
            { filename, data, contentType, bucket },
            uploaderId,
            normalizedTenantId,
          );
          return `/api/system/oss/${record.id}/download`;
        },
      }
    : undefined;

  const systemDeps = {
    db,
    cache,
    jwt,
    jwtSecret,
    passwordHasher,
    totp: totpManager,
    rbac,
    authSessionManager,
    tokenRefresh: tokenRefreshManager,
    sessionManager,
    deviceManager: multiDeviceManager,
    auditLog: auditStore,
    eventBus,
    ...(rpID !== undefined ? { rpID } : {}),
    ...(rpName !== undefined ? { rpName } : {}),
    ...(rpOrigins !== undefined ? { rpOrigins } : {}),
    ...(trustedProxies !== undefined ? { trustedProxies } : {}),
    ...(tenantEnabled !== undefined ? { tenantEnabled } : {}),
    tenantId: normalizedTenantId,
    ...(secureCookies !== undefined ? { secureCookies } : {}),
    ...(fileUploader !== undefined ? { fileUploader } : {}),
  };
  const system = enabled.system ? createSystemModule(systemDeps) : undefined;

  if (enabled.oauth && !system) {
    throw new Error('OAuth module requires the system module');
  }
  if (
    enabled.oauth &&
    (!config.oauthSecretPepper || !config.oauthIssuer || !config.oauthSigningKey)
  ) {
    throw new Error(
      'OAuth pepper, issuer and RS256 signing key are required when OAuth is enabled',
    );
  }
  if (enabled.oauth && !storageAdapter) throw new Error('OAuth module requires a storage adapter');
  const oauthMod =
    enabled.oauth && system
      ? createOAuthModule({
          db,
          rbac,
          authMiddleware: system.liveAuthMiddleware,
          sessionManager,
          storage: storageAdapter!,
          platformAdminMiddleware: system.services.governance.adminOnlyMiddleware,
          secretPepper: config.oauthSecretPepper!,
          tenantId: normalizedTenantId,
          issuer: config.oauthIssuer!,
          loginPath: config.oauthLoginPath ?? '/auth/login',
          secureCookies: secureCookies ?? false,
          signingKey: config.oauthSigningKey!,
          ...(config.oauthAllowLoopbackHttp !== undefined
            ? { allowLoopbackHttp: config.oauthAllowLoopbackHttp }
            : {}),
        })
      : undefined;

  const monitor = enabled.monitor
    ? createMonitorModule({
        healthCheck,
        jwt,
        jwtSecret,
        rbac,
        db,
        authSessionManager,
        sessionManager,
        multiDeviceManager,
        tenantId: normalizedTenantId,
      })
    : undefined;

  const notification =
    enabled.notification && notifyChannels
      ? createNotificationModule({
          db,
          jwt,
          jwtSecret,
          rbac,
          tenantId: normalizedTenantId,
          channels: notifyChannels,
        })
      : undefined;

  const i18n = enabled.i18n
    ? createI18nModule({
        db,
        jwt,
        jwtSecret,
        rbac,
        tenantId: normalizedTenantId,
      })
    : undefined;

  const workflow = enabled.workflow
    ? createWorkflowModule({
        db,
        jwt,
        jwtSecret,
        rbac,
        eventBus,
        tenantId: normalizedTenantId,
      })
    : undefined;

  if (system && workflow) {
    eventBus.on(workflowInstanceCompleted, async (payload) => {
      if (payload.businessType !== 'notice' || !payload.businessId) return;
      if (payload.tenantId !== normalizedTenantId) return;
      try {
        await system.services.notice.publishApproved(payload.businessId, payload.completedBy);
      } catch (error) {
        // 事件在审批事务内同步派发：发布失败不得回滚审批完结（例如审批期间公告被删除）。
        // publishApproved 幂等，重放安全；失败仅记录日志供人工跟进。
        bootLog.error(
          `notice approval publish failed (businessId=${payload.businessId}): ${String(error)}`,
        );
      }
    });
  }

  const schedulerMod = enabled.scheduler
    ? createSchedulerModule({
        db,
        scheduler,
        jwt,
        jwtSecret,
        rbac,
        handlers: jobHandlers ?? {},
        tenantId: normalizedTenantId,
      })
    : undefined;

  const genMod = enabled.gen
    ? createGenModule({
        db,
        executor,
        readTableSchema,
        jwt,
        jwtSecret,
        rbac,
        tenantId: normalizedTenantId,
      })
    : undefined;

  // AI 模块：仅在实际启用时动态加载 @ventostack/ai / @ventostack/ai-context。
  // 这两个包是 optionalDependencies，未启用 AI 的应用不必安装；
  // 动态 import 使未安装时不影响包解析与构建（bun build --packages=external 保留 import 语句，仅运行时触发）。
  //
  // 渠道模块必须晚于 AI 模块创建（它要用 sessionService / agentLoop），
  // 而 AI 模块又要拿渠道的 extraTools / onRunFinished —— 用「闭包晚绑定」破环：
  // 两个钩子只在请求期执行，那时 aiChannelMod 必然已经赋值。
  let aiChannelMod: AiChannelModule | undefined;

  const aiMod = enabled.ai
    ? await loadAIModule({
        db,
        cache,
        // framework/ai 不依赖 platform/auth：认证与权限中间件由平台组装层注入
        authMiddleware: createAuthMiddleware(jwt, jwtSecret, normalizedTenantId),
        permMiddleware: createPermMiddleware(rbac),
        eventBus,
        credentialEncryptionKey: config.aiConfig!.credentialEncryptionKey,
        llmProviders: config.aiConfig?.llmProviders ?? [],
        defaultModel: config.aiConfig?.defaultModel ?? 'gpt-4o-mini',
        storagePath: config.aiConfig?.storagePath ?? './data/knowledge-bases',
        ...(system
          ? { platformAdminMiddleware: system.services.governance.adminOnlyMiddleware }
          : {}),
        ...(notification ? { notification: notification.services.notification } : {}),
        ...(notification && system
          ? {
              async notifyPlatformAdmins(params) {
                const rows = (await db.raw(
                  `SELECT DISTINCT ur.user_id
                   FROM sys_user_role ur
                   JOIN sys_role r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
                   JOIN sys_user u ON u.id = ur.user_id AND u.tenant_id = ur.tenant_id
                   WHERE ur.tenant_id = $1 AND r.code = 'admin' AND r.status = 1
                     AND u.status = 1 AND u.deleted_at IS NULL`,
                  [params.tenantId],
                )) as Array<{ user_id: string }>;
                await Promise.all(
                  rows.map((row) =>
                    notification.services.notification.send({
                      receiverId: row.user_id,
                      channel: 'in_app',
                      title: params.title,
                      content: params.content,
                    }),
                  ),
                );
              },
            }
          : {}),
        ...(config.aiConfig?.expertDataDir ? { expertDataDir: config.aiConfig.expertDataDir } : {}),
        ...(config.aiConfig?.expertHubBaseUrl
          ? { expertHubBaseUrl: config.aiConfig.expertHubBaseUrl }
          : {}),
        ...(config.aiConfig?.expertHubSigningPubkey
          ? { expertHubSigningPubkey: config.aiConfig.expertHubSigningPubkey }
          : {}),
        ...(config.aiConfig?.publicBaseUrl
          ? { publicBaseUrl: config.aiConfig.publicBaseUrl }
          : {}),
        ...(config.aiConfig?.agentRuntime ? { agentRuntime: config.aiConfig.agentRuntime } : {}),
        // 渠道工具：会话开启「渠道通知」时才返回，因此必须异步（要查会话设置）
        ...(enabled.aiChannel
          ? {
              extraTools: async (params) =>
                aiChannelMod ? await aiChannelMod.services.createTools(params) : [],
            }
          : {}),
        // 一轮结束后的自动推送：finalContent 是本轮最后一次完整回复
        ...(enabled.aiChannel
          ? {
              onRunFinished: async (params) => {
                if (!aiChannelMod) return;
                await aiChannelMod.services.notifier.onRunFinished(params);
              },
            }
          : {}),
      })
    : undefined;

  // AI 对话渠道：个人级 IM/IoT 入口，与 Web 会话共用同一份 session
  const aiChannelDeps = config.aiChannelConfig;
  const aiChannel =
    enabled.aiChannel && aiMod
      ? await loadAiChannelModule({
          db,
          cache,
          authMiddleware: createAuthMiddleware(jwt, jwtSecret, normalizedTenantId),
          permMiddleware: createPermMiddleware(rbac),
          credentialEncryptionKey: config.aiConfig!.credentialEncryptionKey,
          // 只暴露渠道真正需要的能力，避免渠道反向依赖 ai 模块的其它服务
          ai: {
            sessionService: aiMod.services.sessionService,
            agentLoop: aiMod.services.agentLoop,
            createToolRegistry: aiMod.services.createToolRegistry,
            llmGateway: aiMod.services.llmGateway,
            agentCrud: aiMod.services.agentCrud,
          },
          ...(aiChannelDeps?.publicBaseUrl ? { publicBaseUrl: aiChannelDeps.publicBaseUrl } : {}),
          ...(aiChannelDeps?.defaultAgentId
            ? { defaultAgentId: aiChannelDeps.defaultAgentId }
            : {}),
          // 兜底：租户内第一个 Agent（渠道未绑定时用，避免「装上却不能用」）
          resolveAgentId: async ({ tenantId, userId }) => {
            try {
              const result = await aiMod.services.agentCrud?.list({
                tenantId,
                userId,
                isAdmin: true,
                page: 1,
                pageSize: 1,
              });
              const first = result?.list?.[0];
              const id = (first as { id?: unknown } | undefined)?.id;
              return typeof id === 'string' && id ? id : null;
            } catch {
              return null;
            }
          },
        })
      : undefined;

  aiChannelMod = aiChannel;

  // AI 上下文洞察：订阅 ai 模块事件流（system 须先创建以提供配置读取）
  const aiContextMod =
    enabled.aiContext && aiMod && system
      ? await loadAiContextModule({
          db,
          emitter: aiMod.services.eventEmitter,
          jwt,
          jwtSecret,
          tenantId: normalizedTenantId,
        })
      : undefined;

  // Aggregate routers
  const router = createRouter();

  // system 提供统一操作审计；挂在聚合路由后覆盖所有已启用平台模块。
  // system 内部已有的局部挂载由中间件自身去重，避免重复日志。
  if (system) router.use(system.operationLogMiddleware);

  // Mount module routers
  if (system) router.merge(system.router);
  if (oauthMod) router.merge(oauthMod.router);
  if (monitor) router.merge(monitor.router);
  if (notification) router.merge(notification.router);
  if (i18n) router.merge(i18n.router);
  if (workflow) router.merge(workflow.router);
  if (oss) router.merge(oss.router);
  if (schedulerMod) router.merge(schedulerMod.router);
  if (genMod) router.merge(genMod.router);
  if (aiMod) router.merge(aiMod.router);
  if (aiChannel) router.merge(aiChannel.router);
  if (aiContextMod) router.merge(aiContextMod.router);

  return {
    ...(system !== undefined ? { system } : {}),
    ...(monitor !== undefined ? { monitor } : {}),
    ...(notification !== undefined ? { notification } : {}),
    ...(i18n !== undefined ? { i18n } : {}),
    ...(workflow !== undefined ? { workflow } : {}),
    ...(oss !== undefined ? { oss } : {}),
    ...(schedulerMod !== undefined ? { scheduler: schedulerMod } : {}),
    ...(genMod !== undefined ? { gen: genMod } : {}),
    router,
    ...(aiMod !== undefined ? { ai: aiMod } : {}),
    ...(aiChannel !== undefined ? { aiChannel } : {}),
    ...(aiContextMod !== undefined ? { aiContext: aiContextMod } : {}),
    ...(oauthMod !== undefined ? { oauth: oauthMod } : {}),
    async init() {
      if (system) await system.init();
      if (monitor) await monitor.init();
      if (notification) await notification.init();
      if (i18n) await i18n.init();
      if (workflow) await workflow.init();
      if (oss) await oss.init();
      if (schedulerMod) await schedulerMod.init();
      if (genMod) await genMod.init();
      if (aiMod) await aiMod.init();
      // 渠道必须在 AI 之后启动：runtime.boot() 会拉起长连接并调用 agentLoop
      if (aiChannel) await aiChannel.init();
      if (aiContextMod) await aiContextMod.init();
      if (oauthMod) await oauthMod.init();
    },
    async shutdown() {
      // 渠道要第一个停：长连接轮询会持续打外部 API，晚停会让对端重投
      if (aiChannel?.shutdown) {
        try {
          await aiChannel.shutdown();
        } catch (error) {
          bootLog.error(`渠道关停失败: ${String(error)}`);
        }
      }
      if (aiMod?.shutdown) {
        try {
          await aiMod.shutdown();
        } catch (error) {
          bootLog.error(`AI 模块关停失败: ${String(error)}`);
        }
      }
    },
  };
}
